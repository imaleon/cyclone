const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

function createRoom(code) {

  rooms[code] = {
    players: []
  };
}

wss.on('connection', ws => {

  ws.on('message', message => {

    const data = JSON.parse(message);

    // JOIN
    if (data.type === 'join') {

      const room = data.room;

      if (!rooms[room]) {
        createRoom(room);
      }
    