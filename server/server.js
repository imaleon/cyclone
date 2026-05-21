// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{
    cors:{origin:"*"}
});

const MAX_PLAYERS = 4;

let waitingPlayers = [];

const rooms = {};

/*
rooms = {
    ABCDE:{
        players:[
            socketId1,
            socketId2
        ],
        alive:[
            socketId1,
            socketId2
        ]
    }
}
*/

function generateRoomCode(){

    return Math.random()
        .toString(36)
        .substring(2,7)
        .toUpperCase();
}

function createMatchRoom(players){

    const room = generateRoomCode();

    rooms[room] = {
        players:[],
        alive:[]
    };

    players.forEach(socket=>{

        socket.join(room);

        rooms[room].players.push(socket.id);

        rooms[room].alive.push(socket.id);

        socket.emit(
            "matchFound",
            room
        );
    });

    io.to(room).emit(
        "startMatch"
    );
}

io.on("connection",socket=>{

    console.log(
        "Connected:",
        socket.id
    );

    // =========================
    // RANDOM MATCHMAKING
    // =========================

    socket.on("findMatch",()=>{

        if(
            waitingPlayers.find(
                s=>s.id === socket.id
            )
        ){
            return;
        }

        waitingPlayers.push(socket);

        // start match at 2 players
        // allow up to 4 if queued quickly

        if(waitingPlayers.length >= 2){

            const players =
                waitingPlayers.splice(
                    0,
                    Math.min(
                        MAX_PLAYERS,
                        waitingPlayers.length
                    )
                );

            createMatchRoom(players);
        }
    });

    // =========================
    // CREATE ROOM
    // =========================

    socket.on("createRoom",room=>{

        rooms[room] = {
            players:[socket.id],
            alive:[socket.id]
        };

        socket.join(room);

        socket.emit(
            "roomCreated",
            room
        );
		
		io.to(room).emit(
			"playerCount",
			rooms[room].players.length
		);
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

        if(
            roomData.players.length
            >= MAX_PLAYERS
        ){

            socket.emit(
                "roomFull"
            );

            return;
        }

        socket.join(room);

        roomData.players.push(
            socket.id
        );

        roomData.alive.push(
            socket.id
        );

        io.to(room).emit(
            "roomJoined",
            room
        );
		
		io.to(room).emit(
			"playerCount",
			roomData.players.length
		);

        // auto start at 2+ players

        if(
            roomData.players.length >= 2
        ){

            setTimeout(()=>{

                io.to(room)
                    .emit(
                        "startMatch"
                    );

            },1000);
        }
    });

    // =========================
    // PLAYER BOARD UPDATE
    // =========================

    socket.on("board",data=>{

        socket.to(data.room)
            .emit(
                "enemyBoard",
                {
                    id:socket.id,
                    grid:data.board
                }
            );
    });

    // =========================
    // GARBAGE
    // =========================

	socket.on("garbage",data=>{
	
		const roomData =
			rooms[data.room];
	
		if(!roomData) return;
	
		const targets =
			roomData.alive.filter(
				id => id !== socket.id
			);
	
		if(targets.length === 0)
			return;
	
		const target =
			targets[
				Math.floor(
					Math.random()
					* targets.length
				)
			];
	
		io.to(target).emit(
			"receiveGarbage",
			data.garbage
		);
	});

    // =========================
    // PLAYER LOST
    // =========================

    socket.on("lost",room=>{

        const roomData =
            rooms[room];

        if(!roomData) return;

        roomData.alive =
            roomData.alive.filter(
                id=>id !== socket.id
            );

        io.to(room).emit(
            "playerEliminated",
            socket.id
        );

        // winner check

        if(
            roomData.alive.length === 1
        ){

            const winnerId =
                roomData.alive[0];

            io.to(winnerId)
                .emit("win");

            io.to(room)
                .emit("matchEnded");

            delete rooms[room];
        }
    });

    // =========================
    // SURRENDER
    // =========================

    socket.on("surrender",room=>{

        socket.emit(
            "youSurrendered"
        );

        socket.to(room)
            .emit(
                "playerSurrendered",
                socket.id
            );

        socket.emit(
            "lost"
        );
    });

    // =========================
    // DISCONNECT
    // =========================

    socket.on("disconnect",()=>{

        console.log(
            "Disconnected:",
            socket.id
        );

        // remove from queue

        waitingPlayers =
            waitingPlayers.filter(
                s=>s.id !== socket.id
            );

        // remove from rooms

        Object.keys(rooms)
            .forEach(room=>{

            const roomData =
                rooms[room];

            if(
                roomData.players.includes(
                    socket.id
                )
            ){

                roomData.players =
                    roomData.players.filter(
                        id=>id !== socket.id
                    );
					
				io.to(room).emit(
					"playerCount",
					roomData.players.length
				);

                roomData.alive =
                    roomData.alive.filter(
                        id=>id !== socket.id
                    );

                socket.to(room)
                    .emit(
                        "playerDisconnected",
                        socket.id
                    );

                // auto win

                if(
                    roomData.alive.length === 1
                ){

                    const winnerId =
                        roomData.alive[0];

                    io.to(winnerId)
                        .emit("win");

                    io.to(room)
                        .emit(
                            "matchEnded"
                        );

                    delete rooms[room];
                }

                // cleanup empty room

                if(
                    roomData.players.length
                    === 0
                ){
					
					io.to(room).emit(
						"playerCount",
						roomData.players.length
					);

                    delete rooms[room];
                }
            }
        });
    });
});

server.listen(
    process.env.PORT || 3000,
    ()=>console.log(
        "Server running"
    )
);
