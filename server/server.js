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
            "roomJoined",
            room
        );
    });

    socket.on("joinRoom",room=>{

        const clients =
            io.sockets.adapter.rooms.get(room);

        if(clients && clients.size < 2){

            socket.join(room);

            io.to(room)
                .emit("roomJoined",room);
        }
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
});

server.listen(
    process.env.PORT || 3000,
    ()=>console.log("Server running")
);