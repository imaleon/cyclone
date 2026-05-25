const SERVER_URL = "https://tetrisonline.onrender.com";
const socket = io(SERVER_URL);

function findMatch() {

    if (matchmaking) return;

    leaveCurrentRoom();

    matchmaking = true;
    multiplayer = true;

    maxPlayers = parseInt(
        document.getElementById("matchType").value
    );

    document.getElementById("status").innerText = "SEARCHING...";

    showMatchmakingPopup(); // ✅ SHOW POPUP

    socket.emit("findMatch", {
        maxPlayers,
        autoJoin: true,
        rank: playerRank,
        rankPoints
    });

    clearTimeout(matchmakingTimeout);

    matchmakingTimeout = setTimeout(() => {

        if (matchmaking) {
            matchmaking = false;

            hideMatchmakingPopup(); // ❌ hide popup

            document.getElementById("status").innerText =
                "MATCHMAKING FAILED";

            alert("Unable to find match.");
        }

    }, 15000);
}

function createRoom(){

	leaveCurrentRoom();

	if(matchmaking) return;
	
	matchmaking = true;

    multiplayer = true;

    maxPlayers =
        parseInt(
            document.getElementById("matchType").value
        );

    room =
        Math.random()
            .toString(36)
            .substring(2,7)
            .toUpperCase();

    socket.emit("createRoom",{
        room,
        maxPlayers
    });

	document.getElementById("roomDisplay")
		.innerText = `ROOM CODE: ${room}`;
	
	document.getElementById("status")
		.innerText = "WAITING FOR PLAYERS...";

    document.getElementById("readyBtn")
        .style.display = "block";
}

function joinRoom(){

	leaveCurrentRoom();

    if(matchmaking) return;

    const code =
        document.getElementById("roomCode")
            .value
            .trim()
            .toUpperCase();

    if(!code){

        alert("ENTER ROOM CODE");
        return;
    }

    matchmaking = true;

    socket.emit("joinRoom",{
        room:code
    });

    document.getElementById("status")
        .innerText = "JOINING...";
}

function readyUp(){

    if(isReady) return;

    isReady = true;

    document.getElementById("readyBtn")
        .innerText = "READY ✓";

    socket.emit("playerReady",room);
}

function exitMatch(){

    if(room){
        socket.emit("forceEnd", { room });
    }

    matchEnded = true;
    running = false;

    cancelAnimationFrame(animationId);

    multiplayer = false;
    room = null;

    hideMatchEndPanel();

    showMenu();
}

function requestRematch(){

    if(!room || rematchSent) return;

    running = false;
    cancelAnimationFrame(animationId);

    rematchSent = true;
    waitingRematch = true;

    hideMatchEndPanel();

    socket.emit("rematchRequest", { room });

    // SHOW POPUP
    document.getElementById("rematchPopup").style.display = "flex";

    const panel = document.getElementById("matchEndPanel");

    panel.querySelectorAll("button").forEach(btn => {
        btn.disabled = true;
    });

    setMatchChatEnabled(true);
}

function cancelRematchWait(){

    if(!room) return;

    waitingRematch = false;
    rematchSent = false;

    document.getElementById("rematchPopup").style.display = "none";

    socket.emit("cancelRematch", { room });

    document.getElementById("status").innerText =
        "REMATCH CANCELED";

    showMatchEndPanel();
}

function leaveCurrentRoom() {

    matchmaking = false;
    clearTimeout(matchmakingTimeout);

    if (room) {
        socket.emit("leaveRoom", room);
    }

    room = null;
    isReady = false;
    readyPlayers = 0;

    document.getElementById("status").innerText = "READY";
    document.getElementById("readyBtn").style.display = "none";
}

socket.on(
    "lobbyChatMessage",
    msg => {

        addLobbyChat(msg);
    }
);

socket.on(
    "matchChatMessage",
    msg => {

        addMatchChat(msg);
    }
);

socket.on("onlineCount", count => {
    const el = document.getElementById("onlinePlayers");
    if (el) {
        el.innerText = `ONLINE: ${count}`;
    }
});

socket.on("rematchStart", () => {

	document.getElementById("rematchPopup").style.display = "none";

	waitingRematch = false;

    // stop old game loop
    running = false;
    cancelAnimationFrame(animationId);

    // reset states
    matchEnded = false;
    paused = false;
    rematchSent = false;
    gameStarted = false;

    // reset gameplay
    score = 0;
    lines = 0;
    level = 1;

    combo = -1;
    backToBack = false;

    dropInterval = 1000;
    dropCounter = 0;
    lastTime = 0;

    lockTimer = 0;
    touchingGround = false;

    holdPiece = null;
    canHold = true;

    piece = null;
    nextPiece = null;

    boardDirty = true;

    // clear board
    resetBoard();

    // clear opponent previews
    opponents = {};
    opponentsContainer.innerHTML = "";

    // reset random bag
    bag = [];

    // hide end panel
    hideMatchEndPanel();

    // re-enable match chat
    setMatchChatEnabled(true);

    // status text
    document.getElementById("status").innerText =
        "REMATCH STARTED";

    // restart cleanly
    startGame();
});

socket.on("opponentLeft", () => {

    matchEnded = true;
    running = false;

    cancelAnimationFrame(animationId);

    showMatchChat();
    showMatchEndPanel();

    document.getElementById("status").innerText =
        "OPPONENT LEFT";
});

socket.on("matchFound", data => {

    hideMatchmakingPopup(); // ✅ ADD THIS

    clearTimeout(matchmakingTimeout);
    matchmaking = false;
    multiplayer = true;

    room = data.room || data;

    document.getElementById("roomDisplay")
        .innerText = `ROOM CODE: ${room}`;

    document.getElementById("status")
        .innerText = "JOINED MATCH";

    document.getElementById("readyBtn").style.display = "block";
});

socket.on("roomCreated", r => {
    clearTimeout(matchmakingTimeout);
    matchmaking = false;

    multiplayer = true;
    room = r;

    document.getElementById("status").innerText = "WAITING FOR PLAYERS...";
    document.getElementById("roomDisplay").innerText = `ROOM CODE: ${room}`;
    document.getElementById("readyBtn").style.display = "block";
});

socket.on("roomJoined", r => {

    hideMatchmakingPopup(); // ✅ ADD THIS

    clearTimeout(matchmakingTimeout);

    matchmaking = false;

    multiplayer = true;

    room = r;

    document.getElementById("roomDisplay")
        .innerText = `ROOM CODE: ${room}`;

    document.getElementById("status")
        .innerText = "PLAYER JOINED";

    document.getElementById("readyBtn")
        .style.display = "block";
});

socket.on("startMatch", () => {

    clearTimeout(matchmakingTimeout);

    matchmaking = false;

    gameStarted = false;

    document.getElementById("status")
        .innerText = "MATCH START";

    document.getElementById("readyBtn")
        .style.display = "none";

    isReady = false;
	
	startGame();
});

socket.on("readyUpdate", data => {

    readyPlayers = data.ready;
    maxPlayers = data.maxPlayers;

	if (!waitingRematch) {
		document.getElementById("status").innerText =
			`READY ${readyPlayers}/${maxPlayers}`;
	}

    document.getElementById("playerCount")
        .innerText =
        `PLAYERS: ${data.players}/${maxPlayers}`;
});

socket.on("roomNotFound",()=>{

	matchmaking = false;

    alert("ROOM DOES NOT EXIST");
});

socket.on("roomFull",()=>{

	matchmaking = false;

    alert("ROOM FULL");
});

socket.on("enemyBoard",data=>{

    const {id,grid} = data;

    if(!opponents[id]){

        createOpponentBoard(id);
    }

    opponents[id].grid = grid;
});

socket.on("receiveGarbage",amount=>{

	soundGarbage();

    addGarbage(amount);
});

socket.on("win", () => {

	soundWin();

    matchEnded = true;
    running = false;

    cancelAnimationFrame(animationId);
	
	addRankPoints(25);

    showMatchChat();
    showMatchEndPanel();

    document.getElementById("status").innerText =
        "YOU WIN";
});

socket.on("matchEnded", () => {

    running = false;
    cancelAnimationFrame(animationId);

    matchEnded = true;

    showMatchChat();
    showMatchEndPanel();
});

socket.on("rematchPlayerJoined", data => {

	waitingRematch = true;
	
	document.getElementById("status").innerText =
		`WAITING REMATCH ${data.ready}/${data.total}`;
});

socket.on("matchForceClosed", () => {

    matchEnded = true;
    running = false;
    paused = false;

    cancelAnimationFrame(animationId);

    multiplayer = false;
    room = null;

    rematchSent = false;
    gameStarted = false;

    opponents = {};
    opponentsContainer.innerHTML = "";

    hideMatchEndPanel();

    resetBoard();

    showLobbyChat();

    document.getElementById("status").innerText = "MATCH CLOSED";

    showMenu();
});

socket.on("playerDisconnected",id=>{

    if(opponents[id]){

        opponents[id].box.remove();

        delete opponents[id];
    }
});

socket.on("playerEliminated",id=>{

    if(opponents[id]){

        opponents[id].box.style.opacity = ".3";
    }
});

socket.on("playerCount",count=>{

    document.getElementById(
        "playerCount"
    ).innerText =
        `PLAYERS: ${count}/4`;
});

