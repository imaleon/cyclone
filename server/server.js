const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 3000;

/*
========================================
GLOBAL ONLINE PLAYERS
========================================
*/
let onlinePlayers = 0;

function broadcastOnline() {
    io.emit("onlineCount", onlinePlayers);
}

/*
========================================
ROOM DATA
========================================
*/
const rooms = {};
const lobbyChat = [];

function createRoomData(maxPlayers = 2) {
    return {
        players: [],
        ready: {},
        maxPlayers,
        started: false,
        rematchVotes: new Set()
    };
}

function cleanupRoom(room) {
    if (!rooms[room]) return;

    const clients = io.sockets.adapter.rooms.get(room);

    if (!clients || clients.size === 0) {
        delete rooms[room];
    }
}

function leaveRoom(socket, room) {
    if (!rooms[room]) return;

    socket.leave(room);

    rooms[room].players =
        rooms[room].players.filter(id => id !== socket.id);

    delete rooms[room].ready[socket.id];
    rooms[room].rematchVotes.delete(socket.id);

    socket.to(room).emit("opponentLeft");

    io.to(room).emit("playerCount", {
        players: rooms[room].players.length,
        maxPlayers: rooms[room].maxPlayers
    });

    cleanupRoom(room);
}

/*
========================================
SOCKET
========================================
*/
io.on("connection", socket => {

    onlinePlayers++;
    broadcastOnline();

    console.log("CONNECTED:", socket.id);

    /*
    ========================================
    DISCONNECT
    ========================================
    */
    socket.on("disconnect", () => {

        console.log("DISCONNECTED:", socket.id);

        onlinePlayers--;
        broadcastOnline();

        for (const room in rooms) {
            if (rooms[room].players.includes(socket.id)) {
                leaveRoom(socket, room);
            }
        }
    });

    /*
    ========================================
    LOBBY CHAT
    ========================================
    */
    socket.on("lobbyChatMessage", msg => {
        const text = `Player: ${msg}`;
        lobbyChat.push(text);
        io.emit("lobbyChatMessage", text);
    });

    /*
    ========================================
    CREATE ROOM
    ========================================
    */
    socket.on("createRoom", data => {

        const room = data.room;
        const maxPlayers = data.maxPlayers || 2;

        if (rooms[room]) {
            socket.emit("roomFull");
            return;
        }

        rooms[room] = createRoomData(maxPlayers);
        rooms[room].players.push(socket.id);

        socket.join(room);

        socket.emit("roomCreated", room);

        console.log("ROOM CREATED:", room);
    });

    /*
    ========================================
    JOIN ROOM
    ========================================
    */
    socket.on("joinRoom", data => {

        const room = data.room;

        if (!rooms[room]) {
            socket.emit("roomNotFound");
            return;
        }

        if (rooms[room].players.length >= rooms[room].maxPlayers) {
            socket.emit("roomFull");
            return;
        }

        rooms[room].players.push(socket.id);
        socket.join(room);

        socket.emit("roomJoined", room);

        io.to(room).emit("playerCount", {
            players: rooms[room].players.length,
            maxPlayers: rooms[room].maxPlayers
        });
    });

    /*
    ========================================
    MATCHMAKING
    ========================================
    */
    socket.on("findMatch", data => {

        const maxPlayers = data.maxPlayers || 2;
        let foundRoom = null;

        for (const room in rooms) {
            const r = rooms[room];

            if (
                !r.started &&
                r.maxPlayers === maxPlayers &&
                r.players.length < r.maxPlayers
            ) {
                foundRoom = room;
                break;
            }
        }

        if (!foundRoom) {
            foundRoom = Math.random()
                .toString(36)
                .substring(2, 7)
                .toUpperCase();

            rooms[foundRoom] = createRoomData(maxPlayers);
        }

        rooms[foundRoom].players.push(socket.id);
        socket.join(foundRoom);

        socket.emit("matchFound", {
            room: foundRoom
        });

        io.to(foundRoom).emit("playerCount", {
            players: rooms[foundRoom].players.length,
            maxPlayers: rooms[foundRoom].maxPlayers
        });
    });

    /*
    ========================================
    READY SYSTEM
    ========================================
    */
    socket.on("playerReady", room => {

        if (!rooms[room]) return;

        rooms[room].ready[socket.id] = true;

        const readyCount = Object.keys(rooms[room].ready).length;

        io.to(room).emit("readyUpdate", {
            ready: readyCount,
            players: rooms[room].players.length,
            maxPlayers: rooms[room].maxPlayers
        });

        if (
            readyCount >= rooms[room].players.length &&
            rooms[room].players.length >= 2
        ) {
            rooms[room].started = true;
            io.to(room).emit("startMatch");
        }
    });

    /*
    ========================================
    GAME DATA
    ========================================
    */
    socket.on("board", data => {
        socket.to(data.room).emit("enemyBoard", {
            id: socket.id,
            grid: data.board
        });
    });

    socket.on("garbage", data => {
        socket.to(data.room).emit("receiveGarbage", data.garbage);
    });

    socket.on("matchChatMessage", data => {
        socket.to(data.room).emit(
            "matchChatMessage",
            `Player: ${data.msg}`
        );
    });

    /*
    ========================================
    GAME END
    ========================================
    */
    socket.on("lost", room => {
        socket.to(room).emit("win");
        io.to(room).emit("matchEnded");
    });

    socket.on("surrender", room => {
        socket.to(room).emit("win");
        io.to(room).emit("matchEnded");
    });

    /*
    ========================================
    REMATCH SYSTEM
    ========================================
    */
    socket.on("rematchRequest", ({ room }) => {

        if (!rooms[room]) return;

        rooms[room].rematchVotes.add(socket.id);

        io.to(room).emit("rematchPlayerJoined", {
            ready: rooms[room].rematchVotes.size,
            total: rooms[room].players.length
        });

        if (rooms[room].rematchVotes.size >= rooms[room].players.length) {
            rooms[room].rematchVotes.clear();
            io.to(room).emit("rematchStart");
        }
    });

    /*
    ========================================
    FORCE END
    ========================================
    */
    socket.on("forceEnd", ({ room }) => {

        if (!rooms[room]) return;

        io.to(room).emit("matchForceClosed");

        const clients = io.sockets.adapter.rooms.get(room);

        if (clients) {
            clients.forEach(id => {
                const s = io.sockets.sockets.get(id);
                if (s) s.leave(room);
            });
        }

        delete rooms[room];

        console.log("ROOM FORCE CLOSED:", room);
    });

    /*
    ========================================
    LEAVE ROOM
    ========================================
    */
    socket.on("leaveRoom", room => {
        leaveRoom(socket, room);
    });

});
/*
========================================
START SERVER
========================================
*/
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON ${PORT}`);
});
