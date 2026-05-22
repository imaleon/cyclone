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
CONFIG
========================================
*/

const ALLOWED_MAX_PLAYERS = [2, 3, 4];

/*
========================================
ROOM DATA
========================================
*/

const rooms = {};

/*
rooms[ROOM] = {
    players: [],
    ready: 0,
    readyPlayers: {},
    maxPlayers: 2,
    started: false
}
*/

/*
========================================
HELPERS
========================================
*/

function createRoomIfMissing(room, maxPlayers = 2){

    if(!rooms[room]){

        rooms[room] = {
            players: [],
            ready: 0,
            readyPlayers: {},
            maxPlayers,
            started: false
        };
    }
}

function updateRoomPlayerCount(room){

    if(!rooms[room]) return;

    io.to(room).emit("readyUpdate", {
        ready: rooms[room].ready,
        maxPlayers: rooms[room].maxPlayers,
        players: rooms[room].players.length
    });

    io.to(room).emit(
        "playerCount",
        rooms[room].players.length
    );
}

function removePlayerFromRoom(socket, room){

    if(!rooms[room]) return;

    rooms[room].players =
        rooms[room].players.filter(id => id !== socket.id);

    delete rooms[room].readyPlayers?.[socket.id];

    rooms[room].ready =
        Object.keys(rooms[room].readyPlayers).length;

    socket.leave(room);

    socket.to(room).emit("playerDisconnected", socket.id);

    // WIN CONDITION
    if(
        rooms[room].started &&
        rooms[room].players.length === 1
    ){
        io.to(rooms[room].players[0]).emit("win");
        delete rooms[room];
        return;
    }

    // DELETE EMPTY ROOM
    if(rooms[room].players.length <= 0){
        delete rooms[room];
        return;
    }

    updateRoomPlayerCount(room);
}

function removePlayerEverywhere(socket){

    for(const room of Object.keys(rooms)){

        if(rooms[room]?.players?.includes(socket.id)){
            removePlayerFromRoom(socket, room);
        }
    }
}

function generateRoomCode(){

    return Math.random()
        .toString(36)
        .substring(2,7)
        .toUpperCase();
}

/*
========================================
SOCKET
========================================
*/

io.on("connection", socket => {

    console.log("CONNECTED:", socket.id);

    socket.lastBoardUpdate = 0;

    /*
    ================================
    LOBBY CHAT
    ================================
    */

    socket.on("lobbyChatMessage", msg => {

        if(typeof msg !== "string") return;

        msg = msg.trim().slice(0,120);

        if(!msg) return;

        io.emit("lobbyChatMessage", `Player: ${msg}`);
    });

    /*
    ================================
    MATCH CHAT
    ================================
    */

    socket.on("matchChatMessage", data => {

        if(!data) return;

        const { room, msg } = data;

        if(!rooms[room]) return;
        if(typeof msg !== "string") return;

        const clean = msg.trim().slice(0,120);
        if(!clean) return;

        socket.to(room).emit(
            "matchChatMessage",
            `Opponent: ${clean}`
        );
    });

    /*
    ================================
    RANDOM MATCHMAKING
    ================================
    */

    socket.on("findMatch", data => {

        removePlayerEverywhere(socket);

        let maxPlayers = parseInt(data?.maxPlayers || 2);

        if(!ALLOWED_MAX_PLAYERS.includes(maxPlayers)){
            maxPlayers = 2;
        }

        let foundRoom = null;

        for(const room in rooms){

            const r = rooms[room];

            if(
                !r.started &&
                r.maxPlayers === maxPlayers &&
                r.players.length < r.maxPlayers
            ){
                foundRoom = room;
                break;
            }
        }

        if(!foundRoom){
            foundRoom = generateRoomCode();
            createRoomIfMissing(foundRoom, maxPlayers);
        }

        socket.join(foundRoom);

        if(!rooms[foundRoom].players.includes(socket.id)){
            rooms[foundRoom].players.push(socket.id);
        }

        socket.room = foundRoom;

        socket.emit("matchFound", foundRoom);

        updateRoomPlayerCount(foundRoom);
    });

    /*
    ================================
    CREATE ROOM
    ================================
    */

    socket.on("createRoom", data => {

        removePlayerEverywhere(socket);

        const room = data.room;
        let maxPlayers = parseInt(data.maxPlayers || 2);

        if(!ALLOWED_MAX_PLAYERS.includes(maxPlayers)){
            maxPlayers = 2;
        }

        if(!room) return;

        if(rooms[room]){
            socket.emit("roomFull");
            return;
        }

        createRoomIfMissing(room, maxPlayers);

        socket.join(room);
        rooms[room].players.push(socket.id);

        socket.room = room;

        socket.emit("roomCreated", room);

        updateRoomPlayerCount(room);
    });

    /*
    ================================
    JOIN ROOM
    ================================
    */

    socket.on("joinRoom", data => {

        removePlayerEverywhere(socket);

        const room = data.room;

        if(!rooms[room]){
            socket.emit("roomNotFound");
            return;
        }

        if(
            rooms[room].started ||
            rooms[room].players.length >= rooms[room].maxPlayers
        ){
            socket.emit("roomFull");
            return;
        }

        socket.join(room);

        if(!rooms[room].players.includes(socket.id)){
            rooms[room].players.push(socket.id);
        }

        socket.room = room;

        io.to(room).emit("roomJoined", room);

        updateRoomPlayerCount(room);
    });

    /*
    ================================
    READY SYSTEM
    ================================
    */

    socket.on("playerReady", room => {

        if(!rooms[room]) return;
        if(rooms[room].started) return;

        if(rooms[room].readyPlayers[socket.id]) return;

        rooms[room].readyPlayers[socket.id] = true;

        rooms[room].ready =
            Object.keys(rooms[room].readyPlayers).length;

        updateRoomPlayerCount(room);

        if(
            rooms[room].ready >= rooms[room].players.length &&
            rooms[room].players.length >= 2
        ){
            rooms[room].started = true;
            io.to(room).emit("startMatch");
        }
    });

    /*
    ================================
    BOARD UPDATE
    ================================
    */

    socket.on("board", data => {

        if(!data) return;
        if(!rooms[data.room]) return;

        const now = Date.now();

        if(now - socket.lastBoardUpdate < 50) return;

        socket.lastBoardUpdate = now;

        socket.to(data.room).emit("enemyBoard", {
            id: socket.id,
            grid: data.board
        });
    });

    /*
    ================================
    GARBAGE
    ================================
    */

    socket.on("garbage", data => {

        if(!data) return;
        if(!rooms[data.room]) return;

        socket.to(data.room).emit(
            "receiveGarbage",
            data.garbage
        );
    });

    /*
    ================================
    LOST
    ================================
    */

    socket.on("lost", room => {

        if(!rooms[room]) return;

        socket.to(room).emit("playerEliminated", socket.id);

        delete rooms[room].readyPlayers[socket.id];

        rooms[room].players =
            rooms[room].players.filter(id => id !== socket.id);

        if(rooms[room].players.length === 1){
            io.to(rooms[room].players[0]).emit("win");
            delete rooms[room];
            return;
        }

        if(rooms[room].players.length <= 0){
            delete rooms[room];
        }
    });

    /*
    ================================
    SURRENDER
    ================================
    */

    socket.on("surrender", room => {

        if(!rooms[room]) return;

        socket.to(room).emit("win");
        socket.emit("matchEnded");

        delete rooms[room];
    });

    /*
    ================================
    LEAVE ROOM
    ================================
    */

    socket.on("leaveRoom", room => {

        removePlayerFromRoom(socket, room);
    });

    /*
    ================================
    DISCONNECT
    ================================
    */

    socket.on("disconnect", () => {

        console.log("DISCONNECTED:", socket.id);

        removePlayerEverywhere(socket);
    });
});

/*
========================================
SERVER
========================================
*/

app.get("/", (req,res)=>{
    res.send("Tetris Online Server Running");
});

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON PORT", PORT);
});
