const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

const MAX_PLAYERS = 4;

let waitingPlayers = [];

/*
rooms = {
  ABCDE: {
    players: [],
    alive: [],
    ready: [],
    maxPlayers: 4,
    started: false
  }
}
*/

const rooms = {};

// =========================
// UTIL
// =========================

function generateRoomCode() {
    return Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();
}

// =========================
// CREATE MATCH ROOM
// =========================

function createMatchRoom(players, maxPlayers) {

    const room = generateRoomCode();

    rooms[room] = {
        players: [],
        alive: [],
        ready: [],
        maxPlayers,
        started: false
    };

    players.forEach(socket => {

        socket.join(room);

        rooms[room].players.push(socket.id);
        rooms[room].alive.push(socket.id);

        socket.emit("matchFound", room);
    });

    io.to(room).emit("readyUpdate", {
        ready: 0,
        players: rooms[room].players.length,
        maxPlayers
    });
}

// =========================
// SOCKET CONNECTION
// =========================

io.on("connection", socket => {

    console.log("Connected:", socket.id);

    // =========================
    // RANDOM MATCHMAKING
    // =========================

    socket.on("findMatch", data => {

        const maxPlayers = data?.maxPlayers || 2;

        if (waitingPlayers.find(p => p.socket.id === socket.id)) {
            return;
        }

        waitingPlayers.push({
            socket,
            maxPlayers
        });

        const sameMode = waitingPlayers.filter(
            p => p.maxPlayers === maxPlayers
        );

        if (sameMode.length >= maxPlayers) {

            const selected = sameMode.slice(0, maxPlayers);

            waitingPlayers = waitingPlayers.filter(
                p => !selected.includes(p)
            );

            createMatchRoom(
                selected.map(p => p.socket),
                maxPlayers
            );
        }
    });

    // =========================
    // CREATE ROOM
    // =========================

    socket.on("createRoom", data => {

        const room = data.room;
        const maxPlayers = data.maxPlayers || 2;

        rooms[room] = {
            players: [socket.id],
            alive: [socket.id],
            ready: [],
            maxPlayers,
            started: false
        };

        socket.join(room);

        socket.emit("roomCreated", room);

        io.to(room).emit("readyUpdate", {
            ready: 0,
            players: 1,
            maxPlayers
        });
    });

    // =========================
    // JOIN ROOM
    // =========================

    socket.on("joinRoom", data => {

        const room = data.room;
        const roomData = rooms[room];

        if (!roomData) {
            socket.emit("roomNotFound");
            return;
        }

        if (roomData.started) {
            socket.emit("roomFull");
            return;
        }

        if (roomData.players.length >= roomData.maxPlayers) {
            socket.emit("roomFull");
            return;
        }

        socket.join(room);

        roomData.players.push(socket.id);
        roomData.alive.push(socket.id);

        io.to(room).emit("roomJoined", room);

        io.to(room).emit("readyUpdate", {
            ready: roomData.ready.length,
            players: roomData.players.length,
            maxPlayers: roomData.maxPlayers
        });
    });

    // =========================
    // READY SYSTEM
    // =========================

    socket.on("playerReady", room => {

        const roomData = rooms[room];
        if (!roomData) return;

        if (!roomData.ready.includes(socket.id)) {
            roomData.ready.push(socket.id);
        }

        io.to(room).emit("readyUpdate", {
            ready: roomData.ready.length,
            players: roomData.players.length,
            maxPlayers: roomData.maxPlayers
        });

        const full =
            roomData.players.length === roomData.maxPlayers;

        const allReady =
            roomData.ready.length === roomData.maxPlayers;

        if (full && allReady && !roomData.started) {

            roomData.started = true;

            io.to(room).emit("startMatch");
        }
    });

    // =========================
    // BOARD UPDATE
    // =========================

    socket.on("board", data => {

        socket.to(data.room).emit("enemyBoard", {
            id: socket.id,
            grid: data.board
        });
    });

    // =========================
    // GARBAGE
    // =========================

    socket.on("garbage", data => {

        const roomData = rooms[data.room];
        if (!roomData) return;

        const targets = roomData.alive.filter(
            id => id !== socket.id
        );

        if (targets.length === 0) return;

        const target =
            targets[Math.floor(Math.random() * targets.length)];

        io.to(target).emit("receiveGarbage", data.garbage);
    });

    // =========================
    // LOST
    // =========================

    socket.on("lost", room => {

        const roomData = rooms[room];
        if (!roomData) return;

        roomData.alive =
            roomData.alive.filter(id => id !== socket.id);

        io.to(room).emit("playerEliminated", socket.id);

        if (roomData.alive.length === 1) {

            const winnerId = roomData.alive[0];

            io.to(winnerId).emit("win");
            io.to(room).emit("matchEnded");

            delete rooms[room];
        }
    });

    // =========================
    // SURRENDER
    // =========================

    socket.on("surrender", room => {

        socket.to(room).emit("playerSurrendered", socket.id);

        socket.emit("lost");
    });

    // =========================
    // DISCONNECT
    // =========================

    socket.on("disconnect", () => {

        console.log("Disconnected:", socket.id);

        waitingPlayers =
            waitingPlayers.filter(
                p => p.socket.id !== socket.id
            );

        Object.keys(rooms).forEach(room => {

            const roomData = rooms[room];

            if (!roomData.players.includes(socket.id)) return;

            roomData.players =
                roomData.players.filter(id => id !== socket.id);

            roomData.alive =
                roomData.alive.filter(id => id !== socket.id);

            roomData.ready =
                roomData.ready.filter(id => id !== socket.id);

            io.to(room).emit("readyUpdate", {
                ready: roomData.ready.length,
                players: roomData.players.length,
                maxPlayers: roomData.maxPlayers
            });

            socket.to(room).emit("playerDisconnected", socket.id);

            // winner check
            if (roomData.alive.length === 1) {

                const winnerId = roomData.alive[0];

                io.to(winnerId).emit("win");
                io.to(room).emit("matchEnded");

                delete rooms[room];
                return;
            }

            // cleanup empty room
            if (roomData.players.length === 0) {
                delete rooms[room];
            }
        });
    });
});

// =========================
// START SERVER
// =========================

server.listen(process.env.PORT || 3000, () => {
    console.log("Server running");
});