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

/* -----------------------------
   STATE
----------------------------- */

let onlineCount = 0;

const rooms = {}; 
// roomId -> { players: [], ready: Set, maxPlayers }

const playerRoom = {}; 
// socket.id -> roomId

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

function removePlayerFromRoom(socket) {
    const roomId = playerRoom[socket.id];
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    room.players = room.players.filter(p => p !== socket.id);
    room.ready.delete(socket.id);

    delete playerRoom[socket.id];

    socket.leave(roomId);

    // notify others
    io.to(roomId).emit("playerDisconnected", socket.id);
    broadcastRoomUpdate(roomId);

    // if empty room delete
    if (room.players.length === 0) {
        delete rooms[roomId];
        return;
    }

    // if host left or not enough players
    if (room.players.length < 2) {
        io.to(roomId).emit("matchForceClosed");
        delete rooms[roomId];
    }
	
    if (rematchVotes[roomId]) {
        rematchVotes[roomId].delete(socket.id);

        if (rematchVotes[roomId].size <= 0) {
            delete rematchVotes[roomId];
        }
    }
}

/* REMATCH SYSTEM */
const rematchVotes = {};

/* -----------------------------
   SOCKET
----------------------------- */

io.on("connection", (socket) => {
    onlineCount++;
    io.emit("onlineCount", onlineCount);

    /* LOGIN */
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

    /* LOBBY CHAT */
    socket.on("lobbyChatMessage", (msg) => {
        io.emit("lobbyChatMessage", msg);
    });

    /* MATCH CHAT */
    socket.on("matchChatMessage", ({ room, username, msg }) => {
        // IMPORTANT FIX: only emit to room except sender (prevents double echo bugs)
        socket.to(room).emit("matchChatMessage", {
            username,
            msg
        });
    });

    /* CREATE ROOM */
    socket.on("createRoom", ({ room, maxPlayers }) => {
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

    /* JOIN ROOM */
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
        io.to(room).emit("playerCount", r.players.length);
    });

    function joinRoomInternal(socket, roomId) {
        socket.join(roomId);

        playerRoom[socket.id] = roomId;

        const room = rooms[roomId];
        room.players.push(socket.id);

        broadcastRoomUpdate(roomId);
    }

    /* FIND MATCH (simple queue system) */
	socket.on("findMatch", ({
		maxPlayers,
		rank,
		rankPoints
	}) => {
	
		socket.data.rank = rank || "BRONZE";
		socket.data.rankPoints = rankPoints || 0;
	
		let foundRoom = null;
	
		for (const id in rooms) {
	
			const r = rooms[id];
	
			// skip full rooms
			if (r.players.length >= r.maxPlayers)
				continue;
	
			// skip different mode
			if (r.maxPlayers !== maxPlayers)
				continue;
	
			// get first player in room
			const firstPlayerId = r.players[0];
	
			const firstSocket =
				io.sockets.sockets.get(firstPlayerId);
	
			if (!firstSocket)
				continue;
	
			const otherRP =
				firstSocket.data.rankPoints || 0;
	
			const diff =
				Math.abs(rankPoints - otherRP);
	
			// ranked range
			let allowedDiff = 300;
	
			if(rankPoints >= 2000){
				allowedDiff = 500;
			}
	
			if(diff <= allowedDiff){
	
				foundRoom = id;
				break;
			}
		}
	
		// no room found -> create new
		if (!foundRoom) {
	
			const newRoom =
				Math.random()
					.toString(36)
					.substring(2, 7)
					.toUpperCase();
	
			rooms[newRoom] = {
				players: [],
				ready: new Set(),
				maxPlayers
			};
	
			foundRoom = newRoom;
		}
	
		joinRoomInternal(socket, foundRoom);
	
		socket.emit("matchFound", {
			room: foundRoom
		});
	});

    /* READY */
    socket.on("playerReady", (room) => {
        const r = rooms[room];
        if (!r) return;

        r.ready.add(socket.id);

        broadcastRoomUpdate(room);

        if (r.ready.size === r.maxPlayers && r.players.length === r.maxPlayers) {
            io.to(room).emit("startMatch");
        }
    });

    /* GAME SYNC */
    socket.on("board", ({ room, board }) => {
        socket.to(room).emit("enemyBoard", {
            id: socket.id,
            grid: board
        });
    });

    /* GARBAGE */
    socket.on("garbage", ({ room, garbage }) => {
        socket.to(room).emit("receiveGarbage", garbage);
    });

    /* LOSE / WIN */
    socket.on("lost", (room) => {
        socket.to(room).emit("win");
        io.to(room).emit("matchEnded");
    });

    socket.on("surrender", (room) => {
        socket.to(room).emit("opponentLeft");
    });

	socket.on("rematchRequest", ({ room }) => {
	
		if (!rematchVotes[room]) {
			rematchVotes[room] = new Set();
		}
	
		rematchVotes[room].add(socket.id);
	
		io.to(room).emit("rematchPlayerJoined", {
			ready: rematchVotes[room].size,
			total: rooms[room]?.players.length || 0
		});
	
		const roomData = rooms[room];
		if (!roomData) return;
	
		if (rematchVotes[room].size >= roomData.players.length) {
	
			delete rematchVotes[room];
	
			roomData.ready.clear();
	
			io.to(room).emit("rematchStart");
		}
	});

    socket.on("cancelRematch", ({ room }) => {
        if (rematchVotes[room]) {
            rematchVotes[room].delete(socket.id);
        }
    });

    /* FORCE END */
    socket.on("forceEnd", ({ room }) => {
        io.to(room).emit("matchForceClosed");
        delete rooms[room];
    });

    /* LEAVE ROOM */
    socket.on("leaveRoom", (room) => {
        removePlayerFromRoom(socket);
    });

    /* DISCONNECT */
    socket.on("disconnect", () => {
        onlineCount--;
        io.emit("onlineCount", onlineCount);

        removePlayerFromRoom(socket);
    });
});

/* -----------------------------
   START SERVER
----------------------------- */

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});