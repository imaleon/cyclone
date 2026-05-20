// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{
    cors:{origin:"*"}
});

const rooms = {};

let waiting = [];

function broadcastPlayers(roomCode){

    const room = rooms[roomCode];

    if(!room) return;

    io.to(roomCode).emit(
        "playersUpdate",
        room.players
    );
}

io.on("connection",socket=>{

    console.log("Connected:",socket.id);

    // =========================
    // RANDOM MATCHMAKING
    // =========================

    socket.on("findMatch",()=>{

        // remove duplicates
        waiting = waiting.filter(
            s => s.id !== socket.id
        );

		if(!waiting.find(s=>s.id===socket.id)){
			waiting.push(socket);
		}

        // start when 2-4 players available
        if(waiting.length >= 2){

            const players =
                waiting.splice(
                    0,
                    Math.min(4,waiting.length)
                );

            const room =
                "ROOM_" +
                Math.random()
                    .toString(36)
                    .substring(2,8)
                    .toUpperCase();

            rooms[room] = {
                players: [],
                alive: [],
                boards: {}
            };

            players.forEach(player=>{

                player.join(room);

                rooms[room]
                    .players
                    .push(player.id);

                rooms[room]
                    .alive
                    .push(player.id);

                player.emit(
                    "matchFound",
                    room
                );
				
				broadcastPlayers(room);
            });

            setTimeout(()=>{

                io.to(room)
                    .emit("startMatch");

            },1000);
        }
    });

    // =========================
    // CREATE ROOM
    // =========================

	socket.on("createRoom",room=>{
	
		if(rooms[room]){
	
			socket.emit("roomFull");
			return;
		}

        rooms[room] = {
            players:[socket.id],
            alive:[socket.id],
            boards:{}
        };

        socket.join(room);

        socket.emit(
            "roomCreated",
            room
        );
		
		broadcastPlayers(room);
    });

    // =========================
    // JOIN ROOM
    // =========================

    socket.on("joinRoom",room=>{

        const roomData =
            rooms[room];

        if(!roomData){

            socket.emit(
                "roomNotFound"
            );

            return;
        }

        if(roomData.players.length >= 4){

            socket.emit(
                "roomFull"
            );

            return;
        }

        socket.join(room);

        roomData.players.push(socket.id);
		
		broadcastPlayers(room);

        roomData.alive.push(socket.id);

        io.to(room)
            .emit(
                "roomJoined",
                room
            );

        // auto start at 2+
        if(roomData.players.length >= 2){

            setTimeout(()=>{

                io.to(room)
                    .emit(
                        "startMatch"
                    );

            },1000);
        }
    });

    // =========================
    // PLAYER BOARD
    // =========================

    socket.on("board",data=>{

        const room =
            rooms[data.room];

        if(!room) return;

        room.boards[socket.id] =
            data.board;

        io.to(data.room)
            .emit(
                "boards",
                room.boards
            );
    });

    // =========================
    // GARBAGE
    // =========================

    socket.on("garbage",data=>{

        const room =
            rooms[data.room];

        if(!room) return;

        const enemies =
            room.alive.filter(
                id => id !== socket.id
            );

        if(enemies.length === 0)
            return;

        // random target
        const target =
            enemies[
                Math.floor(
                    Math.random()
                    * enemies.length
                )
            ];

        io.to(target)
            .emit(
                "receiveGarbage",
                data.garbage
            );
    });

    // =========================
    // PLAYER LOST
    // =========================

    socket.on("lost",roomCode=>{

        const room =
            rooms[roomCode];

        if(!room) return;

        room.alive =
            room.alive.filter(
                id => id !== socket.id
            );

        io.to(roomCode)
            .emit(
                "playerEliminated",
                socket.id
            );

        // ONE PLAYER LEFT = WINNER
        if(room.alive.length === 1){

            const winner =
                room.alive[0];

            io.to(winner)
                .emit("win");

            io.to(roomCode)
                .emit(
                    "matchEnded"
                );

            delete rooms[roomCode];
        }
    });

    // =========================
    // SURRENDER
    // =========================

    socket.on("surrender",roomCode=>{

        const room =
            rooms[roomCode];

        if(!room) return;

        room.alive =
            room.alive.filter(
                id => id !== socket.id
            );

        if(room.alive.length === 1){

            io.to(room.alive[0])
                .emit("win");

            io.to(roomCode)
                .emit(
                    "matchEnded"
                );

            delete rooms[roomCode];
        }
    });

    // =========================
    // DISCONNECT
    // =========================

    socket.on("disconnect",()=>{

        console.log(
            "Disconnected:",
            socket.id
        );

        waiting =
            waiting.filter(
                s => s.id !== socket.id
            );

        for(const roomCode in rooms){

            const room =
                rooms[roomCode];

            room.players =
                room.players.filter(
                    id => id !== socket.id
                );

            room.alive =
                room.alive.filter(
                    id => id !== socket.id
                );

            delete room.boards[socket.id];
			
			broadcastPlayers(roomCode);

            io.to(roomCode)
                .emit(
                    "playerLeft",
                    socket.id
                );

            // if only one remains
            if(room.alive.length === 1){

                io.to(room.alive[0])
                    .emit("win");

                io.to(roomCode)
                    .emit(
                        "matchEnded"
                    );

                delete rooms[roomCode];
            }

            // empty room cleanup
            if(room.players.length === 0){

                delete rooms[roomCode];
				continue;
            }
        }
    });
});

server.listen(
    process.env.PORT || 3000,
    ()=>console.log("Server running")
);
