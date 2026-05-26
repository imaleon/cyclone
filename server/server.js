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
    }
});

const PORT = process.env.PORT || 3000;

/* -----------------------------
   STATE
----------------------------- */

let onlineCount = 0;
let matchmakingQueue = [];

const rooms = {};        // roomId -> { players: [], ready: Set, maxPlayers }
const playerRoom = {};   // socket.id -> roomId
const rematchVotes = {}; // roomId -> Set(socket.id)

/* -----------------------------
   REMATCH HELPERS
----------------------------- */

function forceResetRematch(roomId, by = null) {
    delete rematchVotes[roomId];

    io.to(roomId).emit("rematchForceReset", {
        by,
        timestamp: Date.now()
    });
}

function cleanupSocketFromRematch(socketId) {
    for (const roomId in rematchVotes) {
        const votes = rematchVotes[roomId];
        if (!votes) continue;

        if (votes.has(socketId)) {
            votes.delete(socketId);

            io.to(roomId).emit("rematchCanceled", {
                by: socketId,
                ready: votes.size,
                total: rooms[roomId]?.players.length || 0
            });

            if (votes.size === 0) {
                delete rematchVotes[roomId];
            }
        }
    }
}

/* -----------------------------
   ROOM HELPERS
----------------------------- */

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

function joinRoom(socket, roomId) {
    socket.join(roomId);

    playerRoom[socket.id] = roomId;

    const room = rooms[roomId];
    room.players.push(socket.id);

    broadcastRoomUpdate(roomId);
}

/* -----------------------------
   ROOM CLEANUP
----------------------------- */

function removePlayerFromRoom(socket) {
    const roomId = playerRoom[socket.id];
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    room.players = room.players.filter(p => p !== socket.id);
    room.ready.delete(socket.id);

    delete playerRoom[socket.id];

    socket.leave(roomId);

    // IMPORTANT: cleanup rematch state
    cleanupSocketFromRematch(socket.id);
    forceResetRematch(roomId, socket.id);

    io.to(roomId).emit("playerDisconnected", socket.id);

    broadcastRoomUpdate(roomId);

    if (room.players.length === 0) {
        delete rooms[roomId];
        return;
    }

    if (room.players.length < 2) {
        io.to(roomId).emit("matchForceClosed");
        delete rooms[roomId];
        return;
    }
}

/* -----------------------------
   SOCKET
----------------------------- */

io.on("connection", (socket) => {
    onlineCount++;
    io.emit("onlineCount", onlineCount);

    socket.on("login", ({ username, rank, rankPoints }) => {
        socket.data.username = username || "PLAYER";
        socket.data.rank = rank || "BRONZE";
        socket.data.rankPoints = rankPoints || 0;
    });

    socket.on("lobbyChatMessage", (msg) => {
        io.emit("lobbyChatMessage", msg);
    });

    socket.on("matchChatMessage", ({ room, username, msg }) => {
        socket.to(room).emit("matchChatMessage", { username, msg });
    });

    /* ---------------- ROOM ---------------- */

    socket.on("createRoom", ({ room, maxPlayers }) => {
        if (rooms[room]) return socket.emit("roomFull");

        rooms[room] = {
            players: [],
            ready: new Set(),
            maxPlayers
        };

        joinRoom(socket, room);
        socket.emit("roomCreated", room);
    });

    socket.on("joinRoom", ({ room }) => {
        const r = rooms[room];
        if (!r) return socket.emit("roomNotFound");
        if (r.players.length >= r.maxPlayers) return socket.emit("roomFull");

        joinRoom(socket, room);
        socket.emit("roomJoined", room);

        io.to(room).emit("playerCount", r.players.length);
    });

    /* ---------------- MATCHMAKING ---------------- */

    socket.on("findMatch", ({ maxPlayers, rankPoints, anyRank = false }) => {
        matchmakingQueue = matchmakingQueue.filter(p => p.socket.connected);

        if (matchmakingQueue.find(p => p.socket.id === socket.id)) return;

        let index = -1;

        if (!anyRank) {
            index = matchmakingQueue.findIndex(p =>
                p.maxPlayers === maxPlayers &&
                !p.anyRank &&
                Math.abs((p.rankPoints || 0) - rankPoints) <= 300
            );
        } else {
            index = matchmakingQueue.findIndex(p =>
                p.maxPlayers === maxPlayers
            );
        }

        if (index !== -1) {
            const opponent = matchmakingQueue.splice(index, 1)[0];

            const room = Math.random().toString(36).substring(2, 7).toUpperCase();

            rooms[room] = {
                players: [],
                ready: new Set(),
                maxPlayers
            };

            joinRoom(socket, room);
            joinRoom(opponent.socket, room);

            socket.emit("matchFound", { room });
            opponent.socket.emit("matchFound", { room });

            return;
        }

        matchmakingQueue.push({
            socket,
            maxPlayers,
            rankPoints,
            anyRank
        });
    });

    socket.on("leaveQueue", () => {
        matchmakingQueue =
            matchmakingQueue.filter(p => p.socket.id !== socket.id);
    });

    /* ---------------- READY ---------------- */

    socket.on("playerReady", (room) => {
        const r = rooms[room];
        if (!r) return;

        r.ready.add(socket.id);
        broadcastRoomUpdate(room);

        if (r.ready.size === r.maxPlayers &&
            r.players.length === r.maxPlayers) {
            io.to(room).emit("startMatch");
        }
    });

    /* ---------------- GAME SYNC ---------------- */

    socket.on("board", ({ room, board }) => {
        socket.to(room).emit("enemyBoard", {
            id: socket.id,
            grid: board
        });
    });

    socket.on("garbage", ({ room, garbage }) => {
        socket.to(room).emit("receiveGarbage", garbage);
    });

    /* ---------------- MATCH END ---------------- */

    socket.on("lost", (room) => {
        socket.to(room).emit("win");
        io.to(room).emit("matchEnded");
    });

    socket.on("surrender", (room) => {
        socket.to(room).emit("opponentLeft");
    });

    /* ---------------- REMATCH ---------------- */

    socket.on("rematchRequest", ({ room }) => {
        if (!rematchVotes[room]) {
            rematchVotes[room] = new Set();
        }

        rematchVotes[room].add(socket.id);

        const roomData = rooms[room];
        if (!roomData || roomData.players.length < 2) {
            forceResetRematch(room, socket.id);
            return;
        }

        io.to(room).emit("rematchPlayerJoined", {
            ready: rematchVotes[room].size,
            total: roomData.players.length
        });

        if (rematchVotes[room].size >= roomData.players.length) {
            delete rematchVotes[room];
            roomData.ready.clear();
            io.to(room).emit("rematchStart");
        }
    });

    socket.on("cancelRematch", ({ room }) => {
        const votes = rematchVotes[room];

        if (!votes) {
            forceResetRematch(room, socket.id);
            return;
        }

        votes.delete(socket.id);

        io.to(room).emit("rematchCanceled", {
            by: socket.id,
            ready: votes.size,
            total: rooms[room]?.players.length || 0
        });

        if (votes.size === 0) {
            forceResetRematch(room, socket.id);
        }
    });

    socket.on("forceEnd", ({ room }) => {
        io.to(room).emit("matchForceClosed");
        forceResetRematch(room, socket.id);
        delete rooms[room];
    });

    /* ---------------- LEAVE / DISCONNECT ---------------- */

    socket.on("leaveRoom", () => {
        removePlayerFromRoom(socket);
    });

    socket.on("disconnect", () => {
        onlineCount--;
        io.emit("onlineCount", onlineCount);

        matchmakingQueue =
            matchmakingQueue.filter(p => p.socket.id !== socket.id);

        const roomId = playerRoom[socket.id];

        cleanupSocketFromRematch(socket.id);

        if (roomId) {
            forceResetRematch(roomId, socket.id);
        }

        removePlayerFromRoom(socket);
    });
});

/* -----------------------------
   START SERVER
----------------------------- */

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
