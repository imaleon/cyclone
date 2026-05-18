js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const rooms = {};

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

function createRoom(code) {
    rooms[code] = {
        players: []
    };
}

wss.on('connection', (ws) => {

    ws.on('message', (message) => {

        let data;

        try {
            data = JSON.parse(message);
        } catch (err) {
            console.log('Invalid JSON');
            return;
        }

        // JOIN ROOM
        if (data.type === 'join') {

            const room = data.room;

            if (!rooms[room]) {
                createRoom(room);
            }

            if (rooms[room].players.length >= 2) {

                ws.send(JSON.stringify({
                    type: 'full'
                }));

                return;
            }

            rooms[room].players.push(ws);

            ws.room = room;

            // WAITING
            if (rooms[room].players.length === 1) {

                ws.send(JSON.stringify({
                    type: 'waiting'
                }));
            }

            // START MATCH
            if (rooms[room].players.length === 2) {

                rooms[room].players.forEach(player => {

                    player.send(JSON.stringify({
                        type: 'start'
                    }));

                });
            }
        }

        // PLAYER STATE UPDATE
        if (data.type === 'state') {

            const room = rooms[ws.room];

            if (!room) return;

            room.players.forEach(player => {

                if (player !== ws) {

                    player.send(JSON.stringify({
                        type: 'opponent_state',
                        board: data.board,
                        score: data.score
                    }));

                }

            });
        }

        // GARBAGE ATTACK
        if (data.type === 'attack') {

            const room = rooms[ws.room];

            if (!room) return;

            room.players.forEach(player => {

                if (player !== ws) {

                    player.send(JSON.stringify({
                        type: 'garbage',
                        lines: data.lines
                    }));

                }

            });
        }

        // PLAYER LOST
        if (data.type === 'lose') {

            const room = rooms[ws.room];

            if (!room) return;

            room.players.forEach(player => {

                if (player !== ws) {

                    player.send(JSON.stringify({
                        type: 'win'
                    }));

                }

            });
        }

    });

    ws.on('close', () => {

        const room = rooms[ws.room];

        if (!room) return;

        room.players = room.players.filter(p => p !== ws);

        if (room.players.length === 0) {
            delete rooms[ws.room];
        }

    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
