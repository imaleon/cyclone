const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const rooms = {};

// IMPORTANT FIX
app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

function createRoom(code) {
    rooms[code] = {
        players: []
    };
}

wss.on('connection', ws => {

    ws.on('message', message => {

        let data;

        try {
            data = JSON.parse(message);
        } catch {
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

            if (rooms[room].players.length === 1) {

                ws.send(JSON.stringify({
                    type: 'waiting'
                }));

            } else {

                rooms[room].players.forEach(player => {

                    player.send(JSON.stringify({
                        type: 'start'
                    }));

                });

            }
        }

        // STATE UPDATE
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

        // ATTACK
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

        // LOSE
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
