const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

const rooms = {};

/* =========================
   HELPERS
========================= */

function createRoomIfMissing(room, maxPlayers = 2) {
    if (!rooms[room]) {
        rooms[room] = {
            players: [],
            readyPlayers: {},
            ready: 0,
            maxPlayers,
            started: false
        };
    }
}

function updateRoom(room) {
    if (!rooms[room]) return;

    io.to(room).emit("readyUpdate", {
        ready: rooms[room].ready,
        maxPlayers: rooms[room].maxPlayers,
        players: rooms[room].players.length
    });

    io.to(room).emit("playerCount", rooms[room].players.length);
}

function removePlayer(socket, room) {
    const r = rooms[room];
    if (!r) return;

    r.players = r.players.filter(id => id !== socket.id);
    delete r.readyPlayers[socket.id];

    r.ready = Object.keys(r.readyPlayers).length;

    socket.leave(room);

    socket.to(room).emit("playerDisconnected", socket.id);

    updateRoom(room);

    // WIN CONDITION
    if (r.started && r.players.length === 1) {
        io.to(r.players[0]).emit("win");
        delete rooms[room];
        return;
    }

    if (r.players.length === 0) {
        delete rooms[room];
    }
}

function removeEverywhere(socket) {
    for (const room of Object.keys(rooms)) {
        if (rooms[room].players.includes(socket.id)) {
            removePlayer(socket, room);
        }
    }
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/* =========================
   SOCKET
========================= */

io.on("connection", socket => {

    socket.lastBoardUpdate = 0;

    /* -------- LOBBY CHAT -------- */
    socket.on("lobbyChatMessage", msg => {
        if (typeof msg !== "string") return;

        msg = msg.trim().slice(0, 120);
        if (!msg) return;

        io.emit("lobbyChatMessage", `Player: ${msg}`);
    });

    /* -------- MATCH CHAT -------- */
    socket.on("matchChatMessage", data => {
        if (!data) return;

        const { room, msg } = data;
        if (!rooms[room]) return;
        if (typeof msg !== "string") return;

        const clean = msg.trim().slice(0, 120);
        if (!clean) return;

        socket.to(room).emit("matchChatMessage", `Opponent: ${clean}`);
    });

    /* -------- FIND MATCH -------- */
    socket.on("findMatch", data => {

        removeEverywhere(socket);

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
            found = generateRoomCode();
            createRoomIfMissing(found, maxPlayers);
        }

        socket.join(found);
        rooms[found].players.push(socket.id);
        socket.room = found;

        updateRoom(found);

        // IMPORTANT: your client expects room string OR object
        socket.emit("matchFound", found);
    });

    /* -------- CREATE ROOM -------- */
    socket.on("createRoom", data => {

        removeEverywhere(socket);

        const room = data.room;
        const maxPlayers = data.maxPlayers || 2;

        if (!room) return;

        if (rooms[room]) {
            socket.emit("roomFull");
            return;
        }

        createRoomIfMissing(room, maxPlayers);

        socket.join(room);
        rooms[room].players.push(socket.id);
        socket.room = room;

        socket.emit("roomCreated", room);
        updateRoom(room);
    });

    /* -------- JOIN ROOM -------- */
    socket.on("joinRoom", data => {

        removeEverywhere(socket);

        const room = data.room;

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

    /* -------- READY -------- */
    socket.on("playerReady", room => {

        const r = rooms[room];
        if (!r || r.started) return;

        if (r.readyPlayers[socket.id]) return;

        r.readyPlayers[socket.id] = true;
        r.ready = Object.keys(r.readyPlayers).length;

        updateRoom(room);

        if (
            r.players.length >= 2 &&
            r.ready >= r.players.length
        ) {
            r.started = true;
            io.to(room).emit("startMatch");
        }
    });

    /* -------- BOARD -------- */
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

    /* -------- GARBAGE -------- */
    socket.on("garbage", data => {
        const r = rooms[data.room];
        if (!r) return;

        socket.to(data.room).emit("receiveGarbage", data.garbage);
    });

    /* -------- LOST -------- */
    socket.on("lost", room => {

        const r = rooms[room];
        if (!r) return;

        socket.to(room).emit("playerEliminated", socket.id);

        r.players = r.players.filter(id => id !== socket.id);
        delete r.readyPlayers[socket.id];

        if (r.players.length === 1) {
            io.to(r.players[0]).emit("win");
            delete rooms[room];
            return;
        }

        if (r.players.length === 0) {
            delete rooms[room];
        }
    });

    /* -------- SURRENDER -------- */
    socket.on("surrender", room => {

        if (!rooms[room]) return;

        socket.to(room).emit("win");
        socket.emit("matchEnded");

        delete rooms[room];
    });

    /* -------- LEAVE -------- */
    socket.on("leaveRoom", room => {
        removePlayer(socket, room);
    });

    /* -------- DISCONNECT -------- */
    socket.on("disconnect", () => {
        removeEverywhere(socket);
    });
});

app.get("/", (req, res) => {
    res.send("Tetris Online Server Running");
});

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON PORT", PORT);
});
