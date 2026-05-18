// server.js

const WebSocket = require("ws");

const PORT =
    process.env.PORT || 10000;

const wss =
    new WebSocket.Server({
        port: PORT
    });

const rooms = {};

wss.on("connection", ws => {

    let roomId = null;

    console.log("Player connected");

    ws.on("message", msg => {

        let data;

        try {

            data = JSON.parse(msg);

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

            console.log(
                "Joined room:",
                roomId
            );

            return;

        }

        // RELAY
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

console.log(
    "WebSocket running on port",
    PORT
);