// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server,{
    cors:{origin:"*"}
});

let waiting = null;

io.on("connection",socket=>{

    socket.on("findMatch",()=>{

        if(waiting){

            const room =
                waiting.id + socket.id;

            waiting.join(room);
            socket.join(room);

            waiting.emit(
                "matchFound",
                room
            );

            socket.emit(
                "matchFound",
                room
            );

            waiting = null;

        }else{

            waiting = socket;
        }
    });

    socket.on("createRoom",room=>{

        socket.join(room);

        socket.emit(
            "roomCreated",
            room
        );
    });

	socket.on("joinRoom",room=>{
	
		const clients =
			io.sockets.adapter.rooms.get(room);
	
		if(!clients){
	
			socket.emit(
				"roomNotFound"
			);
	
			return;
		}
	
		if(clients.size >= 2){
	
			socket.emit(
				"roomFull"
			);
	
			return;
		}
	
		socket.join(room);
	
		io.to(room)
			.emit(
				"roomJoined",
				room
			);
	
		setTimeout(()=>{
	
			io.to(room)
				.emit("startMatch");
	
		},1000);
	});

    socket.on("board",data=>{

        socket.to(data.room)
            .emit(
                "enemyBoard",
                data.board
            );
    });

    socket.on("garbage",data=>{

        socket.to(data.room)
            .emit(
                "receiveGarbage",
                data.garbage
            );
    });

	socket.on("lost",room=>{
	
		socket.to(room)
			.emit("win");
	
		io.to(room)
			.emit("matchEnded");
	});

	socket.on("surrender",room=>{
	
		io.to(room)
			.emit("matchEnded");
	});

    socket.on("disconnect",()=>{

        if(waiting === socket){

            waiting = null;
        }
    });
	socket.on("disconnecting",()=>{
	
		const rooms = [...socket.rooms];
	
		rooms.forEach(room=>{
	
			if(room !== socket.id){
	
				socket.to(room)
					.emit("matchEnded");
			}
		});
	
		if(waiting === socket){
	
			waiting = null;
		}
	});
});

server.listen(
    process.env.PORT || 3000,
    ()=>console.log("Server running")
);