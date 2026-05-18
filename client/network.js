const socket = io('http://localhost:3000');

let ROOM_ID = null;

socket.on('waiting', () => {

    document.getElementById(
        'overlayText'
    ).innerText = 'WAITING FOR PLAYER';

});

socket.on('matchFound', data => {

    ROOM_ID = data.roomId;

    document.getElementById(
        'overlay'
    ).style.display = 'none';

    startGame();

});

socket.on('opponentUpdate', data => {

    enemyGrid = data.grid;

});

socket.on('receiveGarbage', data => {

    addGarbage(data.amount);

});

socket.on('youWin', () => {

    alert('YOU WIN');

    location.reload();

});

function sendBoard() {

    if (!ROOM_ID) return;

    socket.emit('playerUpdate', {
        roomId: ROOM_ID,
        grid
    });

}

function sendGarbage(amount) {

    if (!ROOM_ID) return;

    socket.emit('sendGarbage', {
        roomId: ROOM_ID,
        amount
    });

}

function sendLose() {

    if (!ROOM_ID) return;

    socket.emit('gameOver', {
        roomId: ROOM_ID
    });

}