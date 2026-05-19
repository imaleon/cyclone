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
const players = {};

function createRoomId() {
    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
}

io.on('connection', socket => {

    console.log('CONNECTED', socket.id);

    players[socket.id] = {
        id: socket.id,
        username: `Player_${socket.id.slice(0,4)}`
    };
});