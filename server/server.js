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
		rankPoints,
		anyRank = false
	}) => {
	
		// REMOVE DEAD SOCKETS
		matchmakingQueue =
			matchmakingQueue.filter(
				p => p.socket.connected
			);
	
		// PREVENT DUPLICATES
		const alreadyQueued =
			matchmakingQueue.find(
				p => p.socket.id === socket.id
			);
	
		if (alreadyQueued) {
	
			// UPDATE SEARCH MODE
			alreadyQueued.anyRank = anyRank;
	
			return;
		}
	
		let index = -1;
	
		// SAME RANK SEARCH
		if (!anyRank) {
	
			index = matchmakingQueue.findIndex(p =>
	
				p.maxPlayers === maxPlayers &&
	
				!p.anyRank &&
	
				Math.abs(
					(p.rankPoints || 0) - rankPoints
				) <= 300
			);
	
		} else {
	
			// ANY RANK FALLBACK
			index = matchmakingQueue.findIndex(p =>
	
				p.maxPlayers === maxPlayers
			);
		}
	
		// MATCH FOUND
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
			opponent.socket.emit("matchFound", { room });
	
			return;
		}
	
		// ADD TO QUEUE
		matchmakingQueue.push({
			socket,
			maxPlayers,
			rankPoints,
			anyRank
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
	
		if (!rematchVotes[room]) return;
	
		rematchVotes[room].delete(socket.id);
	
		io.to(room).emit("rematchCanceled", {
			by: socket.id,
			ready: rematchVotes[room].size,
			total: rooms[room]?.players.length || 0
		});
	
		if (rematchVotes[room].size <= 0) {
			delete rematchVotes[room];
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
	
		matchmakingQueue =
			matchmakingQueue.filter(
				p => p.socket.id !== socket.id
			);
	
		removePlayerFromRoom(socket);
	});
	
	socket.on("leaveQueue", () => {
	
		matchmakingQueue =
			matchmakingQueue.filter(
				p => p.socket.id !== socket.id
			);
	});	
});

/* -----------------------------
   START SERVER
----------------------------- */

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});