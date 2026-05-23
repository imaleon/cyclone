const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

/* =========================
   STATE
========================= */

const rooms = {}; 
const players = {}; // socket.id -> {room}

let onlineCount = 0;

/* =========================
   HELPERS
========================= */

function getRoom(roomId) {
    return rooms[roomId];
}

function broadcastRoom(roomId, event, data) {
    io.to(roomId).emit(event, data);
}

function updatePlayerCount(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const count = Object.keys(room.players).length;

    broadcastRoom(roomId, "playerCount", count);
    io.to(roomId).emit("readyUpdate", {
        ready: Object.values(room.players).filter(p => p.ready).length,
        players: count,
        maxPlayers: room.maxPlayers
    });
}

/* =========================
   CONNECTION
========================= */

io.on("connection", (socket) => {
    onlineCount++;
    io.emit("onlineCount", onlineCount);

    players[socket.id] = { room: null };

    /* =========================
       LOBBY CHAT
    ========================= */
    socket.on("lobbyChatMessage", (msg) => {
        io.emit("lobbyChatMessage", `Player: ${msg}`);
    });

    /* =========================
       MATCH CHAT
    ========================= */
    socket.on("matchChatMessage", ({ room, msg }) => {
        if (!rooms[room]) return;

        io.to(room).emit("matchChatMessage", `Player: ${msg}`);
    });

    /* =========================
       CREATE ROOM
    ========================= */
    socket.on("createRoom", ({ room, maxPlayers }) => {
        rooms[room] = {
            host: socket.id,
            maxPlayers,
            players: {},
            started: false,
            rematch: {}
        };

        socket.join(room);
        players[socket.id].room = room;

        rooms[room].players[socket.id] = {
            ready: false,
            alive: true
        };

        socket.emit("roomCreated", room);
        updatePlayerCount(room);
    });

    /* =========================
       JOIN ROOM
    ========================= */
    socket.on("joinRoom", ({ room }) => {
        const r = rooms[room];

        if (!r) return socket.emit("roomNotFound");
        if (Object.keys(r.players).length >= r.maxPlayers)
            return socket.emit("roomFull");

        socket.join(room);
        players[socket.id].room = room;

        r.players[socket.id] = {
            ready: false,
            alive: true
        };

        socket.emit("roomJoined", room);
        updatePlayerCount(room);
    });

    /* =========================
       FIND MATCH (simple queue)
    ========================= */
    socket.on("findMatch", ({ maxPlayers }) => {
        let found = null;

        for (const id in rooms) {
            const r = rooms[id];

            if (!r.started &&
                r.maxPlayers === maxPlayers &&
                Object.keys(r.players).length < maxPlayers) {
                found = id;
                break;
            }
        }

        if (!found) {
            const room = Math.random().toString(36).substring(2, 7).toUpperCase();

            rooms[room] = {
                host: socket.id,
                maxPlayers,
                players: {},
                started: false,
                rematch: {}
            };

            found = room;
        }

        socket.join(found);
        players[socket.id].room = found;

        rooms[found].players[socket.id] = {
            ready: false,
            alive: true
        };

        io.to(found).emit("matchFound", { room: found });
        updatePlayerCount(found);
    });

    /* =========================
       READY SYSTEM
    ========================= */
    socket.on("playerReady", (room) => {
        const r = rooms[room];
        if (!r) return;

        if (r.players[socket.id]) {
            r.players[socket.id].ready = true;
        }

        updatePlayerCount(room);

        const allReady =
            Object.values(r.players).length > 1 &&
            Object.values(r.players).every(p => p.ready);

        if (allReady && !r.started) {
            r.started = true;
            io.to(room).emit("startMatch");
        }
    });

    /* =========================
       BOARD SYNC
    ========================= */
    socket.on("board", ({ room, board }) => {
        if (!rooms[room]) return;

        socket.to(room).emit("enemyBoard", {
            id: socket.id,
            grid: board
        });
    });

    /* =========================
       GARBAGE SYSTEM
    ========================= */
    socket.on("garbage", ({ room, garbage }) => {
        if (!rooms[room]) return;

        socket.to(room).emit("receiveGarbage", garbage);
    });

    /* =========================
       LOSS / WIN
    ========================= */
    socket.on("lost", (room) => {
        if (!rooms[room]) return;

        rooms[room].players[socket.id].alive = false;

        socket.to(room).emit("playerEliminated", socket.id);

        const alive = Object.values(rooms[room].players)
            .filter(p => p.alive).length;

        if (alive <= 1) {
            io.to(room).emit("win");
            io.to(room).emit("matchEnded");
        }
    });

    socket.on("surrender", (room) => {
        socket.to(room).emit("opponentLeft");
    });

    /* =========================
       FORCE END
    ========================= */
    socket.on("forceEnd", ({ room }) => {
        io.to(room).emit("matchForceClosed");

        if (rooms[room]) {
            for (const id of Object.keys(rooms[room].players)) {
                if (io.sockets.sockets.get(id)) {
                    io.sockets.sockets.get(id).leave(room);
                }
            }
            delete rooms[room];
        }
    });

    /* =========================
       REMATCH SYSTEM
    ========================= */
    socket.on("rematchRequest", ({ room }) => {
        if (!rooms[room]) return;

        rooms[room].rematch[socket.id] = true;

        const total = Object.keys(rooms[room].players).length;
        const ready = Object.keys(rooms[room].rematch).length;

        io.to(room).emit("rematchPlayerJoined", {
            ready,
            total
        });

        if (ready === total) {
            rooms[room].rematch = {};
            io.to(room).emit("rematchStart");
        }
    });

    socket.on("cancelRematch", ({ room }) => {
        if (!rooms[room]) return;

        delete rooms[room].rematch[socket.id];
    });

    /* =========================
       LEAVE ROOM
    ========================= */
    socket.on("leaveRoom", (room) => {
        if (!rooms[room]) return;

        socket.leave(room);

        delete rooms[room].players[socket.id];

        players[socket.id].room = null;

        updatePlayerCount(room);

        if (Object.keys(rooms[room].players).length === 0) {
            delete rooms[room];
        }
    });

    /* =========================
       DISCONNECT
    ========================= */
    socket.on("disconnect", () => {
        onlineCount--;
        io.emit("onlineCount", onlineCount);

        const room = players[socket.id]?.room;

        if (room && rooms[room]) {
            delete rooms[room].players[socket.id];

            socket.to(room).emit("playerDisconnected", socket.id);

            updatePlayerCount(room);

            if (Object.keys(rooms[room].players).length === 0) {
                delete rooms[room];
            }
        }

        delete players[socket.id];
    });
});

/* =========================
   START SERVER
========================= */

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});