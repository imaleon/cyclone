const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

let waitingPlayer = null;

const rooms = new Map();

io.on('connection', socket => {

    console.log('CONNECTED:', socket.id);

    if (waitingPlayer && waitingPlayer.id !== socket.id) {

        const roomId =
            `room_${waitingPlayer.id}_${socket.id}`;

        waitingPlayer.join(roomId);
        socket.join(roomId);

        rooms.set(roomId, {
            players: [
                waitingPlayer.id,
                socket.id
            ]
        });

        io.to(roomId).emit('matchFound', {
            roomId
        });

        waitingPlayer = null;

    } else {

        waitingPlayer = socket;

        socket.emit('waiting');

    }

    socket.on('playerUpdate', data => {

        socket.to(data.roomId).emit(
            'opponentUpdate',
            data
        );

    });

    socket.on('sendGarbage', data => {

        socket.to(data.roomId).emit(
            'receiveGarbage',
            {
                amount: data.amount
            }
        );

    });

    socket.on('gameOver', data => {

        socket.to(data.roomId).emit(
            'youWin'
        );

    });

    socket.on('disconnect', () => {

        console.log('DISCONNECTED:', socket.id);

        if (
            waitingPlayer &&
            waitingPlayer.id === socket.id
        ) {
            waitingPlayer = null;
        }

    });

});

server.listen(3000, () => {
    console.log('SERVER RUNNING ON 3000');
});