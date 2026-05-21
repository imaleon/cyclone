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
ROOM DATA
========================================
*/

const rooms = {};

/*
rooms[ROOM] = {
    players: [],
    ready: 0,
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
        rooms[room].players.filter(
            id => id !== socket.id
        );

    socket.leave(room);

    socket.to(room).emit(
        "playerDisconnected",
        socket.id
    );

    /*
    if match already started
    and only 1 player remains
    => remaining player wins
    */

    if(
        rooms[room].started &&
        rooms[room].players.length === 1
    ){

        io.to(
            rooms[room].players[0]
        ).emit("win");

        delete rooms[room];

        return;
    }

    /*
    delete empty room
    */

    if(rooms[room].players.length <= 0){

        delete rooms[room];

        return;
    }

    /*
    recalc ready count
    */

    rooms[room].ready =
        Math.min(
            rooms[room].ready,
            rooms[room].players.length
        );

    updateRoomPlayerCount(room);
}

/*
========================================
SOCKET CONNECTION
========================================
*/

io.on("connection", socket => {

    console.log(
        "CONNECTED:",
        socket.id
    );

    /*
    ================================
    GLOBAL LOBBY CHAT
    ================================
    */

    socket.on(
        "lobbyChatMessage",
        msg => {

            if(
                !msg ||
                typeof msg !== "string"
            ) return;

            msg = msg.trim();

            if(!msg) return;

            io.emit(
                "lobbyChatMessage",
                `Player: ${msg}`
            );
        }
    );

    /*
    ================================
    MATCH / ROOM CHAT
    ================================
    */

    socket.on(
        "matchChatMessage",
        data => {

            if(!data) return;

            const room = data.room;
            let msg = data.msg;

            if(
                !room ||
                !msg ||
                typeof msg !== "string"
            ) return;

            msg = msg.trim();

            if(!msg) return;

            socket.to(room).emit(
                "matchChatMessage",
                `Opponent: ${msg}`
            );
        }
    );

    /*
    ================================
    FIND RANDOM MATCH
    ================================
    */

    socket.on(
        "findMatch",
        data => {

            const maxPlayers =
                data?.maxPlayers || 2;

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

            /*
            create room if none found
            */

            if(!foundRoom){

                foundRoom =
                    Math.random()
                        .toString(36)
                        .substring(2,7)
                        .toUpperCase();

                createRoomIfMissing(
                    foundRoom,
                    maxPlayers
                );
            }

            /*
            join room
            */

            socket.join(foundRoom);

            rooms[foundRoom]
                .players
                .push(socket.id);

            socket.room = foundRoom;

            updateRoomPlayerCount(
                foundRoom
            );

            /*
            notify joined
            */

            io.to(foundRoom).emit(
                "matchFound",
                foundRoom
            );
        }
    );

    /*
    ================================
    CREATE ROOM
    ================================
    */

    socket.on(
        "createRoom",
        data => {

            const room = data.room;
            const maxPlayers =
                data.maxPlayers || 2;

            if(!room) return;

            if(rooms[room]){

                socket.emit(
                    "roomFull"
                );

                return;
            }

            createRoomIfMissing(
                room,
                maxPlayers
            );

            socket.join(room);

            rooms[room]
                .players
                .push(socket.id);

            socket.room = room;

            socket.emit(
                "roomCreated",
                room
            );

            updateRoomPlayerCount(
                room
            );
        }
    );

    /*
    ================================
    JOIN ROOM
    ================================
    */

    socket.on(
        "joinRoom",
        data => {

            const room = data.room;

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

            socket.join(room);

            rooms[room]
                .players
                .push(socket.id);

            socket.room = room;

            io.to(room).emit(
                "roomJoined",
                room
            );

            updateRoomPlayerCount(
                room
            );
        }
    );

    /*
    ================================
    READY SYSTEM
    ================================
    */

    socket.on(
        "playerReady",
        room => {

            if(!rooms[room]) return;

            rooms[room].ready++;

            updateRoomPlayerCount(
                room
            );

            /*
            everyone ready
            */

            if(
                rooms[room].ready >=
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
    ================================
    LIVE BOARD UPDATE
    ================================
    */

    socket.on(
        "board",
        data => {

            if(!data) return;

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
    ================================
    GARBAGE ATTACK
    ================================
    */

    socket.on(
        "garbage",
        data => {

            if(!data) return;

            socket.to(data.room).emit(
                "receiveGarbage",
                data.garbage
            );
        }
    );

    /*
    ================================
    PLAYER LOST
    ================================
    */

    socket.on(
        "lost",
        room => {

            if(!rooms[room]) return;

            socket.to(room).emit(
                "playerEliminated",
                socket.id
            );

            rooms[room].players =
                rooms[room].players.filter(
                    id => id !== socket.id
                );

            /*
            if one remains => winner
            */

            if(
                rooms[room].players.length === 1
            ){

                io.to(
                    rooms[room].players[0]
                ).emit("win");

                delete rooms[room];
            }
        }
    );

    /*
    ================================
    SURRENDER
    ================================
    */

    socket.on(
        "surrender",
        room => {

            if(!rooms[room]) return;

            socket.to(room).emit(
                "win"
            );

            io.to(room).emit(
                "matchEnded"
            );

            delete rooms[room];
        }
    );

    /*
    ================================
    DISCONNECT
    ================================
    */

    socket.on(
        "disconnect",
        () => {

            console.log(
                "DISCONNECTED:",
                socket.id
            );

            for(const room in rooms){

                if(
                    rooms[room].players.includes(
                        socket.id
                    )
                ){

                    removePlayerFromRoom(
                        socket,
                        room
                    );
                }
            }
        }
    );
});

/*
========================================
EXPRESS
========================================
*/

app.get("/", (req,res)=>{

    res.send(
        "Tetris Online Server Running"
    );
});

/*
========================================
START SERVER
========================================
*/

server.listen(PORT, () => {

    console.log(
        "SERVER RUNNING ON PORT",
        PORT
    );
});