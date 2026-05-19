const socket = io(SERVER_URL);

let currentRoom = null;
let opponentGrid = null;

socket.on('connected', player => {
    console.log('CONNECTED', player);
});

socket.on('waitingForOpponent', () => {
    setStatus('WAITING FOR PLAYER');
});

socket.on('roomCreated', roomId => {

    currentRoom = roomId;

    setStatus(`ROOM: ${roomId}`);
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
}