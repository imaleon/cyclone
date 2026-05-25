function updateUI(){

	if(!multiplayer){
	
		if(score > highScore){
	
			highScore = score;
	
			localStorage.setItem(
				"tetris_highscore",
				highScore
			);
		}
	
		document.getElementById(
			"bestScore"
		).innerText = highScore;
	
	}else{
	
		document.getElementById(
			"bestScore"
		).innerText = "-";
	}

    document.getElementById("score")
        .innerText = score;

    document.getElementById("lines")
        .innerText = lines;

    document.getElementById("level")
        .innerText = level;
		
	document.getElementById("rank")
		.innerText = playerRank;
	
	document.getElementById("rankPoints")
		.innerText = rankPoints;
		
	const rankEl =
		document.getElementById("rank");
	
	rankEl.className = "value";
	
	rankEl.classList.add(
		"rank-" +
		playerRank.toLowerCase()
	);
	
	currentSkin =
		RANK_SKINS[playerRank];
	
	applyRankSkin();
}

function showMenu(){

    running = false;

    paused = false;

    matchmaking = false;
    room = null;
    isReady = false;
    readyPlayers = 0;
	
	gameStarted = false;

    opponents = {};

    document.getElementById("readyBtn").style.display = "none";

    document.getElementById("roomDisplay").innerText = "";

    document.getElementById("status").innerText = "READY";

    document.getElementById("playerCount").innerText = "PLAYERS: 1/4";

    showLobbyChat();

    cancelAnimationFrame(animationId);

    document.getElementById("menu")
        .style.display = "flex";

    document.getElementById("gameArea")
        .style.display = "none";
}

function showLobbyChat(){

    document.getElementById(
        "lobbyChatPanel"
    ).style.display = "block";

    document.getElementById(
        "matchChatPanel"
    ).style.display = "none";
}

function showMatchChat(){

    document.getElementById(
        "lobbyChatPanel"
    ).style.display = "none";

    document.getElementById(
        "matchChatPanel"
    ).style.display = "block";
}

function showMatchmakingPopup(){
    document.getElementById("matchmakingPopup").style.display = "flex";
}

function hideMatchmakingPopup(){
    document.getElementById("matchmakingPopup").style.display = "none";
}

function showMatchEndPanel(){
    setMatchChatEnabled(false);
    rematchSent = false;

    const panel = document.getElementById("matchEndPanel");
    panel.style.display = "block";

    document.querySelector("#matchEndPanel button").disabled = false;

    resetInputLock(); // ✅ FIX HERE
}

function hideMatchEndPanel(){

    const panel =
        document.getElementById(
            "matchEndPanel"
        );

    panel.style.display = "none";

    rematchSent = false;

    // re-enable buttons
    const buttons =
        panel.querySelectorAll("button");

    buttons.forEach(btn=>{
        btn.disabled = false;
    });
}

function resetInputLock() {
    document.body.style.pointerEvents = "auto";

    const input1 = document.getElementById("lobbyChatInput");
    const input2 = document.getElementById("matchChatInput");

    if (input1) input1.disabled = false;
    if (input2 && room) input2.disabled = false;
}

function setMatchChatEnabled(enabled){

    const input = document.getElementById("matchChatInput");

    if(!input) return;

    // ONLY disable when truly not in room
    if(!room) {
        input.disabled = true;
        return;
    }

    input.disabled = !enabled;
}

function addLobbyChat(msg){

    const box = document.getElementById("lobbyChatBox");

    const div = document.createElement("div");
    div.className = "chatMsg";

    const name =
        (msg.username === username) ? "Me" : msg.username;

    div.textContent = `${name}: ${msg.msg}`;

    box.appendChild(div);

    requestAnimationFrame(() => {
        box.scrollTop = box.scrollHeight;
    });
}

function addMatchChat(msg){

    const box = document.getElementById("matchChatBox");

    const div = document.createElement("div");
    div.className = "chatMsg";

    const name =
        (msg.username === username) ? "Me" : msg.username;

    div.textContent = `${name}: ${msg.msg}`;

    box.appendChild(div);

    requestAnimationFrame(() => {
        box.scrollTop = box.scrollHeight;
    });
}

function toggleMobileControls(){

    const moveControls =
        document.getElementById("moveControls");

    const actionControls =
        document.getElementById("actionControls");

    if(moveControls.style.display === "none"){

        moveControls.style.display = "flex";

        actionControls.style.display = "flex";

    } else {

        moveControls.style.display = "none";

        actionControls.style.display = "none";

    }
}

if(window.innerWidth > 768){

    document.getElementById("moveControls")
        .style.display = "none";

    document.getElementById("actionControls")
        .style.display = "none";
}