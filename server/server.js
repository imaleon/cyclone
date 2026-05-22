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
   ROOMS
========================= */

const rooms = {};

/*
room structure:
{
  players: [],
  readyPlayers: {},
  ready: 0,
  maxPlayers: 2,
  started: false,
  ended: false,
  rematchVotes: Set()
}
*/

/* =========================
   HELPERS
========================= */

function createRoom(room, maxPlayers = 2) {
    rooms[room] = {
        players: [],
        readyPlayers: {},
        ready: 0,
        maxPlayers,
        started: false,
        ended: false,
        rematchVotes: new Set()
    };
}

function updateRoom(room) {
    const r = rooms[room];
    if (!r) return;

    io.to(room).emit("readyUpdate", {
        ready: r.ready,
        maxPlayers: r.maxPlayers,
        players: r.players.length
    });

    io.to(room).emit("playerCount", r.players.length);
}

function clearRoomIfEmpty(room) {
    const r = rooms[room];
    if (!r) return;

    if (r.players.length === 0) {
        delete rooms[room];
    }
}

/* =========================
   MATCH END (IMPORTANT CORE FIX)
========================= */

function endMatch(room) {
    const r = rooms[room];
    if (!r) return;

    r.started = false;
    r.ended = true;
    r.rematchVotes.clear();

    // 🔥 force UI sync on both clients
    io.to(room).emit("matchEnded");
}

/* =========================
   REMOVE PLAYER (FIXED)
========================= */

function removePlayer(socket, room, reason = "leave") {
    const r = rooms[room];
    if (!r) return;

    r.players = r.players.filter(id => id !== socket.id);
    delete r.readyPlayers[socket.id];
    r.rematchVotes.delete(socket.id);

    r.ready = Object.keys(r.readyPlayers).length;

    socket.leave(room);

    socket.to(room).emit("playerDisconnected", socket.id);

    // 🔥 NEW: always notify opponent properly
    if (reason === "disconnect" || reason === "leave") {
        socket.to(room).emit("opponentLeft");
        socket.to(room).emit("matchEnded");
    }

    updateRoom(room);

    // WIN CONDITION
    if (r.started && r.players.length === 1) {
        io.to(r.players[0]).emit("win");
        endMatch(room);
    }

    clearRoomIfEmpty(room);
}

/* =========================
   SOCKET
========================= */

io.on("connection", socket => {

    socket.lastBoardUpdate = 0;

    /* =========================
       CHAT
    ========================= */

    socket.on("lobbyChatMessage", msg => {
        if (typeof msg !== "string") return;

        msg = msg.trim().slice(0, 120);
        if (!msg) return;

        io.emit("lobbyChatMessage", `Player: ${msg}`);
    });

    socket.on("matchChatMessage", data => {
        if (!data) return;

        const { room, msg } = data;
        const r = rooms[room];
        if (!r) return;

        const clean = String(msg).trim().slice(0, 120);
        if (!clean) return;

        socket.to(room).emit("matchChatMessage", `Opponent: ${clean}`);
    });

    /* =========================
       MATCHMAKING
    ========================= */

    socket.on("findMatch", data => {

        for (const r of Object.keys(rooms)) {
            if (rooms[r].players.includes(socket.id)) {
                removePlayer(socket, r, "leave");
            }
        }

        const maxPlayers = data?.maxPlayers || 2;

        let found = null;

        for (const r in rooms) {
            if (
                !rooms[r].started &&
                rooms[r].players.length < rooms[r].maxPlayers &&
                rooms[r].maxPlayers === maxPlayers
            ) {
                found = r;
                break;
            }
        }

        if (!found) {
            found = Math.random().toString(36).substring(2, 7).toUpperCase();
            createRoom(found, maxPlayers);
        }

        socket.join(found);
        rooms[found].players.push(socket.id);
        socket.room = found;

        updateRoom(found);

        socket.emit("matchFound", found);
    });

    socket.on("createRoom", data => {

        const room = data.room;
        const maxPlayers = data.maxPlayers || 2;

        if (!room) return;

        for (const r of Object.keys(rooms)) {
            if (rooms[r].players.includes(socket.id)) {
                removePlayer(socket, r, "leave");
            }
        }

        if (rooms[room]) {
            socket.emit("roomFull");
            return;
        }

        createRoom(room, maxPlayers);

        socket.join(room);
        rooms[room].players.push(socket.id);
        socket.room = room;

        socket.emit("roomCreated", room);
        updateRoom(room);
    });

    socket.on("joinRoom", data => {

        const room = data.room;

        for (const r of Object.keys(rooms)) {
            if (rooms[r].players.includes(socket.id)) {
                removePlayer(socket, r, "leave");
            }
        }

        if (!rooms[room]) {
            socket.emit("roomNotFound");
            return;
        }

        const r = rooms[room];

        if (r.started || r.players.length >= r.maxPlayers) {
            socket.emit("roomFull");
            return;
        }

        socket.join(room);
        r.players.push(socket.id);
        socket.room = room;

        io.to(room).emit("roomJoined", room);
        updateRoom(room);
    });

    /* =========================
       READY SYSTEM
    ========================= */

    socket.on("playerReady", room => {

        const r = rooms[room];
        if (!r || r.started) return;

        if (r.readyPlayers[socket.id]) return;

        r.readyPlayers[socket.id] = true;
        r.ready = Object.keys(r.readyPlayers).length;

        updateRoom(room);

        if (r.ready >= r.players.length && r.players.length >= 2) {
            r.started = true;
            r.ended = false;
            io.to(room).emit("startMatch");
        }
    });

    /* =========================
       GAME DATA
    ========================= */

    socket.on("board", data => {

        const r = rooms[data.room];
        if (!r) return;

        const now = Date.now();
        if (now - socket.lastBoardUpdate < 50) return;
        socket.lastBoardUpdate = now;

        socket.to(data.room).emit("enemyBoard", {
            id: socket.id,
            grid: data.board
        });
    });

    socket.on("garbage", data => {
        const r = rooms[data.room];
        if (!r) return;

        socket.to(data.room).emit("receiveGarbage", data.garbage);
    });

    /* =========================
       LOST / WIN
    ========================= */

    socket.on("lost", room => {

        const r = rooms[room];
        if (!r) return;

        socket.to(room).emit("playerEliminated", socket.id);

        r.players = r.players.filter(id => id !== socket.id);
        delete r.readyPlayers[socket.id];

        if (r.players.length === 1) {
            io.to(r.players[0]).emit("win");
            endMatch(room);
        }

        clearRoomIfEmpty(room);
    });

    socket.on("surrender", room => {

        const r = rooms[room];
        if (!r) return;

        socket.to(room).emit("win");
        endMatch(room);
    });

    /* =========================
       REMATCH (FIXED)
    ========================= */

    socket.on("rematchRequest", ({ room }) => {

        const r = rooms[room];
        if (!r) return;

        r.rematchVotes.add(socket.id);

        io.to(room).emit(
            "matchChatMessage",
            `System: rematch ${r.rematchVotes.size}/${r.players.length}`
        );

        if (r.rematchVotes.size === r.players.length) {

            r.started = false;
            r.ended = false;

            r.readyPlayers = {};
            r.ready = 0;
            r.rematchVotes.clear();

            io.to(room).emit("rematchStart");
        }
    });

    /* =========================
       LEAVE / DISCONNECT
    ========================= */

    socket.on("leaveRoom", room => {
        removePlayer(socket, room, "leave");
    });

    socket.on("disconnect", () => {
        for (const room of Object.keys(rooms)) {
            if (rooms[room].players.includes(socket.id)) {
                removePlayer(socket, room, "disconnect");
            }
        }
    });
});

/* =========================
   SERVER
========================= */

app.get("/", (req, res) => {
    res.send("Tetris Online Server Running");
});

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON PORT", PORT);
});
