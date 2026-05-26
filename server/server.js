const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
    res.send("Server online");
});

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
});

const PORT = process.env.PORT || 3000;

/* -----------------------------
   STATE
----------------------------- */

let onlineCount = 0;

let matchmakingQueue = [];

const rooms = {};
// roomId -> { players: [], ready: Set, maxPlayers }

const playerRoom = {};
// socket.id -> roomId

const rematchVotes = {};
// roomId -> Set()

/* -----------------------------
   HELPERS
----------------------------- */

function getRoom(roomId) {
    return rooms[roomId];
}

function broadcastRoomUpdate(roomId) {

    const room = rooms[roomId];
    if (!room) return;

    io.to(roomId).emit("readyUpdate", {
        ready: room.ready.size,
        maxPlayers: room.maxPlayers,
        players: room.players.length
    });

    io.to(roomId).emit("playerCount", room.players.length);
}

function joinRoomInternal(socket, roomId) {

    socket.join(roomId);

    playerRoom[socket.id] = roomId;

    const room = rooms[roomId];

    if (!room.players.includes(socket.id)) {
        room.players.push(socket.id);
    }

    broadcastRoomUpdate(roomId);
}

function removePlayerFromRoom(socket) {

    const roomId = playerRoom[socket.id];

    if (!roomId) return;

    const room = rooms[roomId];

    if (!room) {
        delete playerRoom[socket.id];
        return;
    }

    // REMOVE PLAYER
    room.players = room.players.filter(
        p => p !== socket.id
    );

    room.ready.delete(socket.id);

    delete playerRoom[socket.id];

    socket.leave(roomId);

    /* -----------------------------
       REMATCH CLEANUP
    ----------------------------- */

    const votes = rematchVotes[roomId];

    if (votes) {

        votes.delete(socket.id);

        io.to(roomId).emit("rematchCanceled", {
            by: socket.id,
            ready: votes.size,
            total: room.players.length
        });

        // nobody rematching anymore
        if (votes.size === 0) {

            delete rematchVotes[roomId];

            io.to(roomId).emit("rematchReset");
        }
    }

    /* -----------------------------
       NOTIFY PLAYER LEFT
    ----------------------------- */

    io.to(roomId).emit(
        "playerDisconnected",
        socket.id
    );

    broadcastRoomUpdate(roomId);

    /* -----------------------------
       ROOM EMPTY
    ----------------------------- */

    if (room.players.length === 0) {

        delete rematchVotes[roomId];

        io.to(roomId).emit("rematchReset");

        delete rooms[roomId];

        return;
    }

    /* -----------------------------
       ONLY 1 PLAYER LEFT
    ----------------------------- */

    if (room.players.length < 2) {

        // clear rematch votes
        delete rematchVotes[roomId];

        // clear ready states
        room.ready.clear();

        // close rematch popup
        io.to(roomId).emit("rematchReset");

        // notify canceled
        io.to(roomId).emit("rematchCanceled", {
            by: socket.id,
            ready: 0,
            total: room.players.length
        });

        // end match
        io.to(roomId).emit("matchForceClosed");

        delete rooms[roomId];
    }
}

/* -----------------------------
   SOCKET
----------------------------- */

io.on("connection", (socket) => {

    onlineCount++;

    io.emit("onlineCount", onlineCount);

    /* -----------------------------
       LOGIN
    ----------------------------- */

    socket.on("login", ({
        username,
        rank,
        rankPoints
    }) => {

        socket.data.username =
            username || "PLAYER";

        socket.data.rank =
            rank || "BRONZE";

        socket.data.rankPoints =
            rankPoints || 0;
    });

    /* -----------------------------
       LOBBY CHAT
    ----------------------------- */

    socket.on("lobbyChatMessage", (msg) => {

        io.emit("lobbyChatMessage", msg);
    });

    /* -----------------------------
       MATCH CHAT
    ----------------------------- */

    socket.on("matchChatMessage", ({
        room,
        username,
        msg
    }) => {

        socket.to(room).emit(
            "matchChatMessage",
            {
                username,
                msg
            }
        );
    });

    /* -----------------------------
       CREATE ROOM
    ----------------------------- */

    socket.on("createRoom", ({
        room,
        maxPlayers
    }) => {

        if (rooms[room]) {

            socket.emit("roomFull");

            return;
        }

        rooms[room] = {
            players: [],
            ready: new Set(),
            maxPlayers
        };

        joinRoomInternal(socket, room);

        socket.emit("roomCreated", room);
    });

    /* -----------------------------
       JOIN ROOM
    ----------------------------- */

    socket.on("joinRoom", ({ room }) => {

        const r = rooms[room];

        if (!r) {

            socket.emit("roomNotFound");

            return;
        }

        if (r.players.length >= r.maxPlayers) {

            socket.emit("roomFull");

            return;
        }

        joinRoomInternal(socket, room);

        socket.emit("roomJoined", room);

        io.to(room).emit(
            "playerCount",
            r.players.length
        );
    });

    /* -----------------------------
       MATCHMAKING
    ----------------------------- */

    socket.on("findMatch", ({
        maxPlayers,
        rankPoints,
        anyRank = false
    }) => {

        // remove dead sockets
        matchmakingQueue =
            matchmakingQueue.filter(
                p => p.socket.connected
            );

        // prevent duplicates
        const alreadyQueued =
            matchmakingQueue.find(
                p => p.socket.id === socket.id
            );

        if (alreadyQueued) {

            alreadyQueued.anyRank =
                anyRank;

            return;
        }

        let index = -1;

        // same rank matchmaking
        if (!anyRank) {

            index =
                matchmakingQueue.findIndex(
                    p =>

                        p.maxPlayers === maxPlayers &&

                        !p.anyRank &&

                        Math.abs(
                            (p.rankPoints || 0) -
                            rankPoints
                        ) <= 300
                );

        } else {

            // any rank fallback
            index =
                matchmakingQueue.findIndex(
                    p =>
                        p.maxPlayers === maxPlayers
                );
        }

        // match found
        if (index !== -1) {

            const opponent =
                matchmakingQueue.splice(index, 1)[0];

            const room = Math.random()
                .toString(36)
                .substring(2, 7)
                .toUpperCase();

            rooms[room] = {
                players: [],
                ready: new Set(),
                maxPlayers
            };

            joinRoomInternal(socket, room);

            joinRoomInternal(opponent.socket, room);

            socket.emit("matchFound", { room });

            opponent.socket.emit(
                "matchFound",
                { room }
            );

            return;
        }

        // add to queue
        matchmakingQueue.push({
            socket,
            maxPlayers,
            rankPoints,
            anyRank
        });
    });

    /* -----------------------------
       READY
    ----------------------------- */

    socket.on("playerReady", (room) => {

        const r = rooms[room];

        if (!r) return;

        r.ready.add(socket.id);

        broadcastRoomUpdate(room);

        if (
            r.ready.size === r.maxPlayers &&
            r.players.length === r.maxPlayers
        ) {

            io.to(room).emit("startMatch");
        }
    });

    /* -----------------------------
       BOARD SYNC
    ----------------------------- */

    socket.on("board", ({
        room,
        board
    }) => {

        socket.to(room).emit(
            "enemyBoard",
            {
                id: socket.id,
                grid: board
            }
        );
    });

    /* -----------------------------
       GARBAGE
    ----------------------------- */

    socket.on("garbage", ({
        room,
        garbage
    }) => {

        socket.to(room).emit(
            "receiveGarbage",
            garbage
        );
    });

    /* -----------------------------
       MATCH END
    ----------------------------- */

    socket.on("lost", (room) => {

        socket.to(room).emit("win");

        io.to(room).emit("matchEnded");
    });

    socket.on("surrender", (room) => {

        socket.to(room).emit("opponentLeft");
    });

    /* -----------------------------
       REMATCH
    ----------------------------- */

    socket.on("rematchRequest", ({ room }) => {

        const roomData = rooms[room];

        if (!roomData) {

            socket.emit("rematchReset");

            return;
        }

        if (roomData.players.length < 2) {

            socket.emit("rematchReset");

            return;
        }

        if (!rematchVotes[room]) {
            rematchVotes[room] = new Set();
        }

        rematchVotes[room].add(socket.id);

        io.to(room).emit(
            "rematchPlayerJoined",
            {
                ready: rematchVotes[room].size,
                total: roomData.players.length
            }
        );

        // everybody voted
        if (
            rematchVotes[room].size >=
            roomData.players.length
        ) {

            delete rematchVotes[room];

            roomData.ready.clear();

            io.to(room).emit("rematchReset");

            io.to(room).emit("rematchStart");
        }
    });

    socket.on("cancelRematch", ({ room }) => {

        const votes = rematchVotes[room];

        if (!votes) {

            socket.emit("rematchReset");

            return;
        }

        votes.delete(socket.id);

        const total =
            rooms[room]?.players.length || 0;

        io.to(room).emit("rematchCanceled", {
            by: socket.id,
            ready: votes.size,
            total
        });

        // reset if empty
        if (votes.size === 0) {

            delete rematchVotes[room];

            io.to(room).emit("rematchReset");
        }
    });

    /* -----------------------------
       FORCE END
    ----------------------------- */

    socket.on("forceEnd", ({ room }) => {

        io.to(room).emit(
            "matchForceClosed"
        );

        delete rematchVotes[room];

        delete rooms[room];
    });

    /* -----------------------------
       LEAVE ROOM
    ----------------------------- */

    socket.on("leaveRoom", () => {

        removePlayerFromRoom(socket);
    });

    /* -----------------------------
       LEAVE QUEUE
    ----------------------------- */

    socket.on("leaveQueue", () => {

        matchmakingQueue =
            matchmakingQueue.filter(
                p => p.socket.id !== socket.id
            );
    });

    /* -----------------------------
       DISCONNECT
    ----------------------------- */

    socket.on("disconnect", () => {

        onlineCount--;

        io.emit(
            "onlineCount",
            onlineCount
        );

        matchmakingQueue =
            matchmakingQueue.filter(
                p => p.socket.id !== socket.id
            );

        removePlayerFromRoom(socket);
    });
});

/* -----------------------------
   START SERVER
----------------------------- */

server.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );
});
