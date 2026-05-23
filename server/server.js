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
GLOBAL STATE
========================================
*/
let onlinePlayers = 0;

const rooms = {};

const lobbyChat = [];

/*
========================================
ROOM FACTORY
========================================
*/
function createRoomData(maxPlayers = 2){

    return {
        players: [],
        ready: {},
        maxPlayers,
        started: false,
        rematchVotes: new Set()
    };
}

/*
========================================
ONLINE COUNT
========================================
*/
function broadcastOnline(){

    io.emit(
        "onlineCount",
        onlinePlayers
    );
}

/*
========================================
ROOM CLEANUP
========================================
*/
function cleanupRoom(room){

    if(!rooms[room])
        return;

    const clients =
        io.sockets.adapter.rooms.get(room);

    if(!clients || clients.size === 0){

        delete rooms[room];

        console.log(
            "ROOM DELETED:",
            room
        );
    }
}

/*
========================================
LEAVE ROOM
========================================
*/
function leaveRoom(socket, room){

    if(!rooms[room])
        return;

    socket.leave(room);

    rooms[room].players =
        rooms[room].players.filter(
            p => p.id !== socket.id
        );

    delete rooms[room].ready[socket.id];

    rooms[room].rematchVotes.delete(
        socket.id
    );

    socket.to(room).emit(
        "opponentLeft"
    );

    io.to(room).emit(
        "playerCount",
        {
            players:
                rooms[room].players.length,

            maxPlayers:
                rooms[room].maxPlayers
        }
    );

    cleanupRoom(room);
}

/*
========================================
SOCKET CONNECTION
========================================
*/
io.on("connection", socket => {

    onlinePlayers++;

    broadcastOnline();

    console.log(
        "CONNECTED:",
        socket.id
    );

    /*
    ========================================
    LOGIN
    ========================================
    */
    socket.on("login", data => {

        socket.username =
            data.username || "PLAYER";

        console.log(
            "LOGIN:",
            socket.username
        );
    });

    /*
    ========================================
    DISCONNECT
    ========================================
    */
    socket.on("disconnect", () => {

        console.log(
            "DISCONNECTED:",
            socket.id
        );

        onlinePlayers--;

        broadcastOnline();

        for(const room in rooms){

            const exists =
                rooms[room].players.find(
                    p => p.id === socket.id
                );

            if(exists){

                leaveRoom(socket, room);
            }
        }
    });

    /*
    ========================================
    LOBBY CHAT
    ========================================
    */
    socket.on(
        "lobbyChatMessage",
        data => {

            const payload = {
                username:
                    socket.username || "PLAYER",

                msg: data.msg
            };

            lobbyChat.push(payload);

            if(lobbyChat.length > 50){

                lobbyChat.shift();
            }

            io.emit(
                "lobbyChatMessage",
                payload
            );
        }
    );

    /*
    ========================================
    CREATE ROOM
    ========================================
    */
    socket.on(
        "createRoom",
        data => {

            const room =
                data.room;

            const maxPlayers =
                data.maxPlayers || 2;

            if(rooms[room]){

                socket.emit(
                    "roomFull"
                );

                return;
            }

            rooms[room] =
                createRoomData(maxPlayers);

            rooms[room].players.push({
                id: socket.id,
                username:
                    socket.username || "PLAYER"
            });

            socket.join(room);

            socket.currentRoom = room;

            socket.emit(
                "roomCreated",
                room
            );

            io.to(room).emit(
                "playerCount",
                {
                    players:
                        rooms[room].players.length,

                    maxPlayers
                }
            );

            console.log(
                "ROOM CREATED:",
                room
            );
        }
    );

    /*
    ========================================
    JOIN ROOM
    ========================================
    */
    socket.on(
        "joinRoom",
        data => {

            const room =
                data.room;

            if(!rooms[room]){

                socket.emit(
                    "roomNotFound"
                );

                return;
            }

            if(
                rooms[room].players.length >=
                rooms[room].maxPlayers
            ){

                socket.emit(
                    "roomFull"
                );

                return;
            }

            const alreadyInside =
                rooms[room].players.find(
                    p => p.id === socket.id
                );

            if(alreadyInside)
                return;

            rooms[room].players.push({
                id: socket.id,
                username:
                    socket.username || "PLAYER"
            });

            socket.join(room);

            socket.currentRoom = room;

            socket.emit(
                "roomJoined",
                room
            );

            io.to(room).emit(
                "playerCount",
                {
                    players:
                        rooms[room].players.length,

                    maxPlayers:
                        rooms[room].maxPlayers
                }
            );

            console.log(
                "JOINED ROOM:",
                room
            );
        }
    );

    /*
    ========================================
    MATCHMAKING
    ========================================
    */
    socket.on(
        "findMatch",
        data => {

            const maxPlayers =
                data.maxPlayers || 2;

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

                foundRoom =
                    Math.random()
                        .toString(36)
                        .substring(2,7)
                        .toUpperCase();

                rooms[foundRoom] =
                    createRoomData(maxPlayers);
            }

            const exists =
                rooms[foundRoom].players.find(
                    p => p.id === socket.id
                );

            if(!exists){

                rooms[foundRoom].players.push({
                    id: socket.id,
                    username:
                        socket.username || "PLAYER"
                });
            }

            socket.join(foundRoom);

            socket.currentRoom =
                foundRoom;

            socket.emit(
                "matchFound",
                {
                    room: foundRoom
                }
            );

            io.to(foundRoom).emit(
                "playerCount",
                {
                    players:
                        rooms[foundRoom].players.length,

                    maxPlayers:
                        rooms[foundRoom].maxPlayers
                }
            );

            console.log(
                "MATCH FOUND:",
                foundRoom
            );
        }
    );

    /*
    ========================================
    READY SYSTEM
    ========================================
    */
    socket.on(
        "playerReady",
        room => {

            if(!rooms[room])
                return;

            rooms[room].ready[
                socket.id
            ] = true;

            const readyCount =
                Object.keys(
                    rooms[room].ready
                ).length;

            io.to(room).emit(
                "readyUpdate",
                {
                    ready: readyCount,
                    players:
                        rooms[room].players.length,

                    maxPlayers:
                        rooms[room].maxPlayers
                }
            );

            if(
                readyCount >=
                rooms[room].players.length &&

                rooms[room].players.length >= 2
            ){

                rooms[room].started = true;

                io.to(room).emit(
                    "startMatch"
                );
            }
        }
    );

    /*
    ========================================
    BOARD UPDATE
    ========================================
    */
    socket.on(
        "board",
        data => {

            socket.to(data.room).emit(
                "enemyBoard",
                {
                    id: socket.id,
                    grid: data.board
                }
            );
        }
    );

    /*
    ========================================
    GARBAGE
    ========================================
    */
    socket.on(
        "garbage",
        data => {

            socket.to(data.room).emit(
                "receiveGarbage",
                data.garbage
            );
        }
    );

    /*
    ========================================
    MATCH CHAT
    ========================================
    */
    socket.on(
        "matchChatMessage",
        data => {

            io.to(data.room).emit(
                "matchChatMessage",
                {
                    username:
                        socket.username || "PLAYER",

                    msg: data.msg
                }
            );
        }
    );

    /*
    ========================================
    LOST
    ========================================
    */
    socket.on(
        "lost",
        room => {

            socket.to(room).emit(
                "win"
            );

            io.to(room).emit(
                "matchEnded"
            );
        }
    );

    /*
    ========================================
    SURRENDER
    ========================================
    */
    socket.on(
        "surrender",
        room => {

            socket.to(room).emit(
                "win"
            );

            io.to(room).emit(
                "matchEnded"
            );
        }
    );

    /*
    ========================================
    REMATCH
    ========================================
    */
    socket.on(
        "rematchRequest",
        ({ room }) => {

            if(!rooms[room])
                return;

            rooms[room]
                .rematchVotes
                .add(socket.id);

            io.to(room).emit(
                "rematchPlayerJoined",
                {
                    ready:
                        rooms[room]
                            .rematchVotes.size,

                    total:
                        rooms[room]
                            .players.length
                }
            );

            if(
                rooms[room]
                    .rematchVotes.size >=

                rooms[room]
                    .players.length
            ){

                rooms[room]
                    .rematchVotes
                    .clear();

                rooms[room].ready = {};

                rooms[room].started = false;

                io.to(room).emit(
                    "rematchStart"
                );
            }
        }
    );

    /*
    ========================================
    CANCEL REMATCH
    ========================================
    */
    socket.on(
        "cancelRematch",
        ({ room }) => {

            if(!rooms[room])
                return;

            rooms[room]
                .rematchVotes
                .delete(socket.id);

            io.to(room).emit(
                "readyUpdate",
                {
                    ready:
                        rooms[room]
                            .rematchVotes.size,

                    players:
                        rooms[room]
                            .players.length,

                    maxPlayers:
                        rooms[room]
                            .maxPlayers
                }
            );
        }
    );

    /*
    ========================================
    FORCE END
    ========================================
    */
    socket.on(
        "forceEnd",
        ({ room }) => {

            if(!rooms[room])
                return;

            io.to(room).emit(
                "matchForceClosed"
            );

            const clients =
                io.sockets.adapter.rooms.get(room);

            if(clients){

                clients.forEach(id => {

                    const s =
                        io.sockets.sockets.get(id);

                    if(s){

                        s.leave(room);

                        s.currentRoom = null;
                    }
                });
            }

            delete rooms[room];

            console.log(
                "ROOM CLOSED:",
                room
            );
        }
    );

    /*
    ========================================
    LEAVE ROOM
    ========================================
    */
    socket.on(
        "leaveRoom",
        room => {

            leaveRoom(socket, room);
        }
    );
});

/*
========================================
START SERVER
========================================
*/
server.listen(PORT, () => {

    console.log(
        `SERVER RUNNING ON ${PORT}`
    );
});