const SERVER_URL = "https://tetrisonline.onrender.com";
const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 20000
});

socket.on("connect", () => {
    console.log("Connected to server");
    document.getElementById("status").innerText = "ONLINE";
});

socket.on("connect_error", () => {
    document.getElementById("status").innerText =
        "SERVER WAKING UP...";
});

function findMatch() {

    if (matchmaking) return;

    leaveCurrentRoom();

    matchmaking = true;
    multiplayer = true;

    maxPlayers = parseInt(
        document.getElementById("matchType").value
    );

    document.getElementById("status").innerText =
        "SEARCHING SAME RANK...";

    showMatchmakingPopup();

    // FIRST SEARCH = SAME RANK ONLY
    socket.emit("findMatch", {
        maxPlayers,
        autoJoin: true,
        rank: playerRank,
        rankPoints,
        anyRank: false
    });

    clearTimeout(matchmakingTimeout);

    // AFTER 5 SECONDS -> EXPAND SEARCH
    matchmakingTimeout = setTimeout(() => {

        if (!matchmaking) return;

        document.getElementById("status").innerText =
            "EXPANDING SEARCH...";

        document.getElementById(
            "matchmakingStatus"
        ).innerText =
            "No equal-rank players found.\nSearching all ranks...";

        // SECOND SEARCH = ANY RANK
        socket.emit("findMatch", {
            maxPlayers,
            autoJoin: true,
            rank: playerRank,
            rankPoints,
            anyRank: true
        });

    }, 5000);

    // FULL FAIL TIMEOUT
    setTimeout(() => {

        if (matchmaking) {

            matchmaking = false;

            hideMatchmakingPopup();

            document.getElementById("status").innerText =
                "MATCHMAKING FAILED";

            alert("Unable to find match.");
        }

    }, 15000);
}

function cancelMatchmaking() {

    matchmaking = false;

    clearTimeout(matchmakingTimeout);

    hideMatchmakingPopup();

    document.getElementById("status").innerText =
        "MATCHMAKING CANCELED";

    socket.emit("leaveQueue");
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

socket.on("rematchCanceled", data => {

    waitingRematch = false;
    rematchSent = false;

    // hide popup
    document.getElementById("rematchPopup").style.display = "none";

    // re-enable buttons
    const panel = document.getElementById("matchEndPanel");

    panel.querySelectorAll("button").forEach(btn => {
        btn.disabled = false;
    });

    document.getElementById("status").innerText =
        "REMATCH CANCELED";

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

    hideMatchEndPanel();

    resetBoard();

    showLobbyChat();

    document.getElementById("status").innerText = "MATCH CLOSED";

    showMenu();
});

socket.on("playerDisconnected", id => {

    if (opponents[id]) {

        opponents[id].box.remove();

        opponents[id].box.dataset.used = "";

        opponents[id]
            .box
            .querySelector(".enemyName")
            .innerText = "WAITING...";

        const ctx = opponents[id].ctx;

        ctx.clearRect(0, 0, 120, 240);

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

