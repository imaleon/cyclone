const socket = io(SERVER_URL);

let currentRoom = null;
let opponentGrid = null;

socket.on('connect', () => {
    console.log('CONNECTED');
});

socket.on('waitingForOpponent', () => {
    setStatus('WAITING FOR PLAYER');
});

socket.on('roomCreated', roomId => {

    currentRoom = roomId;

    setStatus('ROOM: ' + roomId);
});

socket.on('roomError', msg => {
    alert(msg);
});

socket.on('matchFound', data => {

    currentRoom = data.roomId;

    setStatus('MATCH FOUND');

    startNewGame();
});

socket.on('opponentState', data => {

    opponentGrid = data.grid;
});

socket.on('receiveGarbage', lines => {

    addGarbage(lines);
});

socket.on('opponentLost', () => {

    alert('YOU WIN');
});

function findRandomMatch() {

    socket.emit('findMatch');
}

function createPrivateRoom() {

    socket.emit('createRoom');
}

function joinPrivateRoom() {

    const roomId =
        document.getElementById('roomInput').value;

    socket.emit('joinRoom', roomId);
}

function sendGameState() {

    if (!currentRoom) return;

    socket.emit('gameState', {
        roomId: currentRoom,
        grid: grid,
        score: score
    });
}

function sendGarbage(lines) {

    if (!currentRoom) return;

    socket.emit('sendGarbage', {
        roomId: currentRoom,
        lines: lines
    });
}

window.findRandomMatch = findRandomMatch;
window.createPrivateRoom = createPrivateRoom;
window.joinPrivateRoom = joinPrivateRoom;
