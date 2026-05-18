const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {

    res.writeHead(200);

    res.end("WebSocket server running");

});

const wss = new WebSocket.Server({
    server
});

const rooms = {};

wss.on("connection", ws => {

    let roomId = null;

    console.log("Player connected");

    ws.on("message", message => {

        let data;

        try {

            data = JSON.parse(message);

        } catch {

            return;

        }

        // JOIN ROOM
        if(data.type === "join") {

            roomId = data.room;

            if(!rooms[roomId]) {

                rooms[roomId] = [];

            }

            rooms[roomId].push(ws);

            console.log("Joined:", roomId);

            return;

        }

        // RELAY TO ROOM
        if(roomId && rooms[roomId]) {

            rooms[roomId].forEach(client => {

                if(
                    client !== ws &&
                    client.readyState === WebSocket.OPEN
                ) {

                    client.send(
                        JSON.stringify(data)
                    );

                }

            });

        }

    });

    ws.on("close", () => {

        console.log("Disconnected");

        if(roomId && rooms[roomId]) {

            rooms[roomId] =
                rooms[roomId]
                .filter(c => c !== ws);

            if(rooms[roomId].length === 0) {

                delete rooms[roomId];

            }

        }

    });

});

server.listen(PORT, () => {

    console.log(
        "Server running on port",
        PORT
    );

});
