const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

const waitingPlayers = [];
const rooms = {};

function createRoomId() {
    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
}

io.on('connection', socket => {

    console.log('CONNECTED:', socket.id);

    socket.on('findMatch', () => {

        if (waitingPlayers.length > 0) {

            const opponentId = waitingPlayers.shift();

            const roomId = createRoomId();

            socket.join(roomId);

            const opponentSocket =
                io.sockets.sockets.get(opponentId);

            if (!opponentSocket) return;

            opponentSocket.join(roomId);

            rooms[roomId] = {
                players: [socket.id, opponentId]
            };

            io.to(roomId).emit('matchFound', {
                roomId
            });

        } else {

            waitingPlayers.push(socket.id);

            socket.emit('waitingForOpponent');
        }
    });

    socket.on('disconnect', () => {

        const index =
            waitingPlayers.indexOf(socket.id);

        if (index !== -1) {
            waitingPlayers.splice(index, 1);
        }

        console.log('DISCONNECTED:', socket.id);
    });
});

app.get('/', (_, res) => {
    res.send('Tetris Multiplayer Server Running');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON ${PORT}`);
});