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
LOGIN USERS
========================================
*/
const users = {}; // username -> socket.id

/*
========================================
GLOBAL ONLINE
========================================
*/
let onlinePlayers = 0;

function broadcastOnline() {

    io.emit(
        "onlineCount",
        onlinePlayers
    );
}

/*
========================================
ROOM DATA
========================================
*/
const rooms = {};

function createRoomData(maxPlayers = 2){

    return {
        players: [],
        ready: {},
        maxPlayers,
        started: false,
        rematchVotes: new Set()
    };
}

function cleanupRoom(room){

    if(!rooms[room])
        return;

    const clients =
        io.sockets.adapter.rooms.get(room);

    if(!clients || clients.size === 0){

        delete rooms[room];

        console.log(
            "ROOM CLEANED:",
            room
        );
    }
}

function leaveRoom(socket, room){

    if(!rooms[room])
        return;

    socket.leave(room);

    rooms[room].players =
        rooms[room].players.filter(
            id => id !== socket.id
        );

    delete rooms[room].ready[socket.id];

    rooms[room]
        .rematchVotes
        .delete(socket.id);

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
SOCKET
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
    socket.on("login", username => {

        username =
            String(username || "")
                .trim()
                .substring(0,16);

        if(!username){

            socket.emit(
                "loginError",
                "INVALID USERNAME"
            );

            return;
        }

        if(users[username]){

            socket.emit(
                "loginError",
                "USERNAME TAKEN"
            );

            return;
        }

        users[username] = socket.id;

        socket.username = username;

        socket.emit(
            "loginSuccess",
            username
        );

        io.emit(
            "lobbyChatMessage",
            {
                username: "SYSTEM",
                msg: `${username} joined`
            }
        );

        console.log(
            "LOGIN:",
            username
        );
    });

    /*
    ========================================
    DISCONNECT
    ========================================
    */
    socket.on("disconnect", () => {

        onlinePlayers--;

        broadcastOnline();

        console.log(
            "DISCONNECTED:",
            socket.id
        );

        if(socket.username){

            delete users[socket.username];

            io.emit(
                "lobbyChatMessage",
                {
                    username: "SYSTEM",
                    msg:
                        `${socket.username} left`
                }
            );
        }

        for(const room in rooms){

            if(
                rooms[room]
                    .players
                    .includes(socket.id)
            ){
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
        msg => {

        if(!socket.username)
            return;

        msg =
            String(msg || "")
                .trim()
                .substring(0,200);

        if(!msg)
            return;

        io.emit(
            "lobbyChatMessage",
            {
                username:
                    socket.username,

                msg
            }
        );
    });

    /*
    ========================================
    CREATE ROOM
    ========================================
    */
    socket.on(
        "createRoom",
        data => {

        if(!socket.username)
            return;

        const room = data.room;

        const maxPlayers =
            data.maxPlayers || 2;

        if(rooms[room]){

            socket.emit("roomFull");

            return;
        }

        rooms[room] =
            createRoomData(maxPlayers);

        rooms[room]
            .players
            .push(socket.id);

        socket.join(room);

        socket.emit(
            "roomCreated",
            room
        );

        io.to(room).emit(
            "playerCount",
            {
                players:
                    rooms[room]
                        .players.length,

                maxPlayers:
                    rooms[room]
                        .maxPlayers
            }
        );

        console.log(
            "ROOM CREATED:",
            room
        );
    });

    /*
    ========================================
    JOIN ROOM
    ========================================
    */
    socket.on(
        "joinRoom",
        data => {

        if(!socket.username)
            return;

        const room = data.room;

        if(!rooms[room]){

            socket.emit(
                "roomNotFound"
            );

            return;
        }

        if(
            rooms[room]
                .players.length >=
            rooms[room]
                .maxPlayers
        ){

            socket.emit("roomFull");

            return;
        }

        rooms[room]
            .players
            .push(socket.id);

        socket.join(room);

        socket.emit(
            "roomJoined",
            room
        );

        io.to(room).emit(
            "playerCount",
            {
                players:
                    rooms[room]
                        .players.length,

                maxPlayers:
                    rooms[room]
                        .maxPlayers
            }
        );
    });

    /*
    ========================================
    MATCHMAKING
    ========================================
    */
    socket.on(
        "findMatch",
        data => {

        if(!socket.username)
            return;

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

        rooms[foundRoom]
            .players
            .push(socket.id);

        socket.join(foundRoom);

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
                    rooms[foundRoom]
                        .players.length,

                maxPlayers:
                    rooms[foundRoom]
                        .maxPlayers
            }
        );
    });

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

        rooms[room]
            .ready[socket.id] = true;

        const readyCount =
            Object.keys(
                rooms[room].ready
            ).length;

        io.to(room).emit(
            "readyUpdate",
            {
                ready: readyCount,

                players:
                    rooms[room]
                        .players.length,

                maxPlayers:
                    rooms[room]
                        .maxPlayers
            }
        );

        if(
            readyCount >=
            rooms[room]
                .players.length &&

            rooms[room]
                .players.length >= 2
        ){

            rooms[room].started = true;

            io.to(room).emit(
                "startMatch"
            );
        }
    });

    /*
    ========================================
    GAME BOARD
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
    });

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
    });

    /*
    ========================================
    MATCH CHAT
    ========================================
    */
    socket.on(
        "matchChatMessage",
        data => {

        if(!socket.username)
            return;

        const msg =
            String(data.msg || "")
                .trim()
                .substring(0,200);

        if(!msg)
            return;

        io.to(data.room).emit(
            "matchChatMessage",
            {
                username:
                    socket.username,

                msg
            }
        );
    });

    /*
    ========================================
    WIN / LOSE
    ========================================
    */
    socket.on(
        "lost",
        room => {

        socket.to(room).emit("win");

        io.to(room).emit(
            "matchEnded"
        );
    });

    socket.on(
        "surrender",
        room => {

        socket.to(room).emit("win");

        io.to(room).emit(
            "matchEnded"
        );
    });

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

            io.to(room).emit(
                "rematchStart"
            );
        }
    });

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
    });

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
                }
            });
        }

        delete rooms[room];

        console.log(
            "ROOM CLOSED:",
            room
        );
    });

    /*
    ========================================
    LEAVE ROOM
    ========================================
    */
    socket.on(
        "leaveRoom",
        room => {

        leaveRoom(socket, room);
    });
});

/*
========================================
ROOT
========================================
*/
app.get("/", (req,res) => {

    res.send(
        "TETRA CLASH SERVER RUNNING"
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