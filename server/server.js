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

function createRoomIfMissing(
    room,
    maxPlayers = 2
){

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

    io.to(room).emit(
        "readyUpdate",
        {
            ready:
                rooms[room].ready,

            maxPlayers:
                rooms[room].maxPlayers,

            players:
                rooms[room].players.length
        }
    );

    io.to(room).emit(
        "playerCount",
        rooms[room].players.length
    );
}

function removePlayerFromRoom(
    socket,
    room
){

    if(!rooms[room]) return;

    rooms[room].players =
        rooms[room].players.filter(
            id => id !== socket.id
        );

    delete rooms[room]
        .readyPlayers?.[socket.id];

    rooms[room].ready =
        Object.keys(
            rooms[room].readyPlayers
        ).length;

    socket.leave(room);

    socket.to(room).emit(
        "playerDisconnected",
        socket.id
    );

    /*
    if match started and
    only one remains => win
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

    if(
        rooms[room].players.length <= 0
    ){

        delete rooms[room];

        return;
    }

    updateRoomPlayerCount(room);
}

function removePlayerEverywhere(
    socket
){

    const roomList =
        Object.keys(rooms);

    for(const room of roomList){

        if(
            rooms[room]
                ?.players
                ?.includes(socket.id)
        ){

            removePlayerFromRoom(
                socket,
                room
            );
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
SOCKET CONNECTION
========================================
*/

io.on("connection", socket => {

    console.log(
        "CONNECTED:",
        socket.id
    );

    socket.lastBoardUpdate = 0;

    /*
    ====================================
    GLOBAL LOBBY CHAT
    ====================================
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

            if(msg.length > 120){

                msg =
                    msg.substring(0,120);
            }

            io.emit(
                "lobbyChatMessage",
                `Player: ${msg}`
            );
        }
    );

    /*
    ====================================
    MATCH CHAT
    ====================================
    */

    socket.on(
        "matchChatMessage",
        data => {

            if(!data) return;

            const room =
                data.room;

            let msg =
                data.msg;

            if(
                !room ||
                !msg ||
                typeof msg !== "string"
            ) return;

            if(!rooms[room]) return;

            msg = msg.trim();

            if(!msg) return;

            if(msg.length > 120){

                msg =
                    msg.substring(0,120);
            }

            socket.to(room).emit(
                "matchChatMessage",
                `Opponent: ${msg}`
            );
        }
    );

    /*
    ====================================
    RANDOM MATCHMAKING
    ====================================
    */

    socket.on(
        "findMatch",
        data => {

            removePlayerEverywhere(
                socket
            );

            const maxPlayers =
                data?.maxPlayers || 2;

            let foundRoom = null;

            for(const room in rooms){

                const r = rooms[room];

                if(
                    !r.started &&
                    r.ready === 0 &&
                    r.maxPlayers ===
                        maxPlayers &&
                    r.players.length <
                        r.maxPlayers
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
                    generateRoomCode();

                createRoomIfMissing(
                    foundRoom,
                    maxPlayers
                );
            }

            /*
            join room
            */

            socket.join(foundRoom);

            if(
                !rooms[foundRoom]
                    .players
                    .includes(socket.id)
            ){

                rooms[foundRoom]
                    .players
                    .push(socket.id);
            }

            socket.room = foundRoom;

            updateRoomPlayerCount(
                foundRoom
            );

            io.to(foundRoom).emit(
                "matchFound",
                foundRoom
            );
        }
    );

    /*
    ====================================
    CREATE ROOM
    ====================================
    */

    socket.on(
        "createRoom",
        data => {

            removePlayerEverywhere(
                socket
            );

            const room =
                data.room;

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

            if(
                !rooms[room]
                    .players
                    .includes(socket.id)
            ){

                rooms[room]
                    .players
                    .push(socket.id);
            }

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
    ====================================
    JOIN ROOM
    ====================================
    */

    socket.on(
        "joinRoom",
        data => {

            removePlayerEverywhere(
                socket
            );

            const room =
                data.room;

            if(!rooms[room]){

                socket.emit(
                    "roomNotFound"
                );

                return;
            }

            if(
                rooms[room].started ||
                rooms[room].players
                    .length >=
                rooms[room].maxPlayers
            ){

                socket.emit(
                    "roomFull"
                );

                return;
            }

            socket.join(room);

            if(
                !rooms[room]
                    .players
                    .includes(socket.id)
            ){

                rooms[room]
                    .players
                    .push(socket.id);
            }

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
    ====================================
    READY SYSTEM
    ====================================
    */

    socket.on(
        "playerReady",
        room => {

            if(!rooms[room]) return;

            if(
                rooms[room]
                    .started
            ){
                return;
            }

            if(
                rooms[room]
                    .readyPlayers
                    [socket.id]
            ){
                return;
            }

            rooms[room]
                .readyPlayers
                [socket.id] = true;

            rooms[room].ready =
                Object.keys(
                    rooms[room]
                        .readyPlayers
                ).length;

            updateRoomPlayerCount(
                room
            );

            /*
            everyone ready
            */

            if(
                rooms[room].ready >=
                rooms[room].players
                    .length &&
                rooms[room].players
                    .length >= 2
            ){

                rooms[room]
                    .started = true;

                io.to(room).emit(
                    "startMatch"
                );
            }
        }
    );

    /*
    ====================================
    LIVE BOARD UPDATE
    ====================================
    */

    socket.on(
        "board",
        data => {

            if(!data) return;

            if(
                !rooms[data.room]
            ) return;

            const now =
                Date.now();

            /*
            anti flood
            */

            if(
                now -
                socket.lastBoardUpdate
                < 50
            ){
                return;
            }

            socket.lastBoardUpdate =
                now;

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
    ====================================
    GARBAGE
    ====================================
    */

    socket.on(
        "garbage",
        data => {

            if(!data) return;

            if(
                !rooms[data.room]
            ) return;

            socket.to(data.room).emit(
                "receiveGarbage",
                data.garbage
            );
        }
    );

    /*
    ====================================
    PLAYER LOST
    ====================================
    */

    socket.on(
        "lost",
        room => {

            if(!rooms[room]) return;

            socket.to(room).emit(
                "playerEliminated",
                socket.id
            );

            delete rooms[room]
                .readyPlayers
                [socket.id];

            rooms[room].players =
                rooms[room].players.filter(
                    id => id !== socket.id
                );

            /*
            only one remains
            */

            if(
                rooms[room].players
                    .length === 1
            ){

                io.to(
                    rooms[room]
                        .players[0]
                ).emit("win");

                delete rooms[room];

                return;
            }

            /*
            no players left
            */

            if(
                rooms[room].players
                    .length <= 0
            ){

                delete rooms[room];
            }
        }
    );

    /*
    ====================================
    SURRENDER
    ====================================
    */

    socket.on(
        "surrender",
        room => {

            if(!rooms[room]) return;

            socket.to(room).emit(
                "win"
            );

            socket.emit(
                "matchEnded"
            );

            delete rooms[room];
        }
    );

    /*
    ====================================
    LEAVE ROOM
    ====================================
    */

    socket.on(
        "leaveRoom",
        room => {

            removePlayerFromRoom(
                socket,
                room
            );
        }
    );

    /*
    ====================================
    DISCONNECT
    ====================================
    */

    socket.on(
        "disconnect",
        () => {

            console.log(
                "DISCONNECTED:",
                socket.id
            );

            removePlayerEverywhere(
                socket
            );
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
