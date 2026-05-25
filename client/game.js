window.canvas =
    document.getElementById("board");

window.ctx =
    canvas.getContext("2d");
	
window.running = false;
window.room = null;
window.board = [];
window.piece = null;

// =====================
// PURE CODE SOUND SYSTEM
// =====================

let isLoggedIn = false;
let username = "";

const COLS = 10;
const ROWS = 20;
const SIZE = 30;

const opponentsContainer =
    document.getElementById(
        "opponentsContainer"
    );

const nextCtx =
    document.getElementById("next")
        .getContext("2d");

const holdCtx =
    holdCanvas.getContext("2d");

let multiplayer = false;
let room = null;
let opponents = {};

let matchmaking = false;
let matchmakingTimeout = null;

let maxPlayers = 2;
let readyPlayers = 0;
let isReady = false;

let paused = false;
let soloPauseMenuOpen = false;
let running = false;
let animationId = null;

let gameStarted = false;

let matchEnded = false;

let rematchSent = false;

let waitingRematch = false;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

const COLORS = {
    I:"#00f0ff",
    J:"#0033ff",
    L:"#ffaa00",
    O:"#ffff00",
    S:"#00ff00",
    T:"#cc00ff",
    Z:"#ff0000",
    X:"#666"
};

const SHAPES = {
    I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J:[[1,0,0],[1,1,1],[0,0,0]],
    L:[[0,0,1],[1,1,1],[0,0,0]],
    O:[[1,1],[1,1]],
    S:[[0,1,1],[1,1,0],[0,0,0]],
    T:[[0,1,0],[1,1,1],[0,0,0]],
    Z:[[1,1,0],[0,1,1],[0,0,0]]
};

let board = [];
let piece = null;
let nextPiece = null;
let holdPiece = null;
let canHold = true;

let rankPoints =
    parseInt(
        localStorage.getItem("tetris_rank_points")
    ) || 0;

let playerRank = "BRONZE";

let unlockedRanks =
    JSON.parse(
        localStorage.getItem(
            "tetris_unlocked_ranks"
        )
    ) || ["BRONZE"];

let currentSkin =
    RANK_SKINS[playerRank];

let highScore =
    parseInt(
        localStorage.getItem(
            "tetris_highscore"
        )
    ) || 0;

let score = 0;
let lines = 0;
let level = 1;

let dropInterval = 1000;
let dropCounter = 0;
let lastTime = 0;
let networkTimer = 0;
let boardDirty = false;

let lockDelay = 500;
let lockTimer = 0;
let touchingGround = false;

let lastMoveRotate = false;
let message = "";
let messageTimer = 0;

let combo = -1;
let backToBack = false;

let musicInterval;

function login(){

    const input =
        document.getElementById(
            "usernameInput"
        );

    const name =
        input.value
            .trim()
            .toUpperCase();

    if(!name){

        alert("ENTER USERNAME");
        return;
    }

    username = name;
	
	localStorage.setItem(
		"tetris_username",
		username
	);

    isLoggedIn = true;

    // hide login screen
    document.getElementById(
        "loginScreen"
    ).style.display = "none";

    // optional:
    // send username to server
	socket.emit("login",{
		username,
		rank: playerRank,
		rankPoints
	});

    // show game menu
    showMenu();
}

function resetBoard(){

    board = Array.from(
        {length:ROWS},
        ()=>Array(COLS).fill(0)
    );
}

let bag = [];

function shuffle(array){

    for(let i=array.length-1;i>0;i--){

        const j = Math.floor(Math.random()*(i+1));

        [array[i],array[j]] =
            [array[j],array[i]];
    }

    return array;
}

function refillBag(){

    bag = shuffle(
        Object.keys(SHAPES)
    );
}

function randomType(){

    if(bag.length === 0){

        refillBag();
    }

    return bag.pop();
}

function createPiece(type){

    return{
        type,
        matrix:
            JSON.parse(
                JSON.stringify(SHAPES[type])
            ),
        x:3,
        y:0
    };
}

function spawn(){

    piece = createPiece(nextPiece);

    nextPiece = randomType();
	
	lockTimer = 0;
	touchingGround = false;
	lastMoveRotate = false;

    if(collide()){

        gameOver();
    }
}

function collide(
    offsetX=0,
    offsetY=0,
    matrix=piece.matrix
){

    for(let y=0;y<matrix.length;y++){

        for(let x=0;x<matrix[y].length;x++){

            if(!matrix[y][x]) continue;

            const nx = piece.x+x+offsetX;
            const ny = piece.y+y+offsetY;

            if(nx<0 || nx>=COLS || ny>=ROWS)
                return true;

            if(ny>=0 && board[ny][nx])
                return true;
        }
    }

    return false;
}

function merge(){

    piece.matrix.forEach((row,y)=>{

        row.forEach((v,x)=>{

            if(v){

                board[piece.y+y][piece.x+x]
                    = piece.type;
            }
        });
    });
	
	boardDirty = true;
}

function isTSpin(){

    if(piece.type !== "T")
        return false;

    if(!lastMoveRotate)
        return false;

    let corners = 0;

    const px = piece.x + 1;
    const py = piece.y + 1;

    const checks = [
        [px-1,py-1],
        [px+1,py-1],
        [px-1,py+1],
        [px+1,py+1]
    ];

    for(const [x,y] of checks){

        if(
            x < 0 ||
            x >= COLS ||
            y >= ROWS ||
            (y >= 0 && board[y][x])
        ){
            corners++;
        }
    }

    return corners >= 3;
}

function clearLines(){

    let cleared = 0;

    outer:
    for(let y=ROWS-1;y>=0;y--){

        for(let x=0;x<COLS;x++){

            if(board[y][x]===0)
                continue outer;
        }

        board.splice(y,1);

        board.unshift(
            Array(COLS).fill(0)
        );

        cleared++;

        y++;
    }
	
	const tspin = isTSpin();
	
	let difficultClear =
		tspin || cleared === 4;

    if(cleared){
	
		soundClear();
	
		combo++;

		if(tspin){
		
			if(cleared === 1){
		
				score += 800 * level;
		
				message = "T-SPIN SINGLE";
			}
		
			else if(cleared === 2){
		
				score += 1200 * level;
		
				message = "T-SPIN DOUBLE";
			}
		
			else if(cleared === 3){
		
				score += 1600 * level;
		
				message = "T-SPIN TRIPLE";
			}
		
			else{
		
				score += 400 * level;
		
				message = "T-SPIN";
			}
		
		}else{
		
			score +=
				[0,100,300,500,800][cleared]
				* level;
		
			if(cleared === 4){
		
				message = "TETRIS";
			}
		}
		
		messageTimer = 120;
		
		if(difficultClear){
		
			if(backToBack){
		
				score += 200 * level;
		
				message += " B2B";
			}
		
			backToBack = true;
		
		}else if(cleared > 0){
		
			backToBack = false;
		}
		
		if(combo > 0){
		
			const comboBonus =
				combo * 50 * level;
		
			score += comboBonus;
		
			message =
				`COMBO x${combo}`;
		}

        lines += cleared;

        level = Math.floor(lines/10)+1;

        dropInterval =
            Math.max(
                100,
                1000-(level-1)*70
            );

        updateUI();
		
		boardDirty = true;

		if(multiplayer){
		
			let garbage = 0;
		
			if(tspin){
		
				if(cleared === 1) garbage = 2;
				if(cleared === 2) garbage = 4;
				if(cleared === 3) garbage = 6;
		
			}else{
		
				if(cleared === 2) garbage = 1;
				if(cleared === 3) garbage = 2;
				if(cleared === 4) garbage = 4;
			}
		
			if(combo > 0){
		
				garbage += Math.min(4,combo);
			}
		
			if(backToBack && difficultClear){
		
				garbage += 1;
			}
		
			if(garbage > 0){
		
				socket.emit("garbage",{
					room,
					garbage
				});
			}
		}
    }
	
	else{
	
		combo = -1;
	}
}

function addGarbage(amount){

    for(let i=0;i<amount;i++){

        board.shift();

        const hole =
            Math.floor(
                Math.random()*COLS
            );

        const row =
            Array(COLS).fill("X");

        row[hole] = 0;

        board.push(row);
    }
	
	boardDirty = true;
}

function rotate(clockwise=true){

    const m = piece.matrix;

    let rotated;

    if(clockwise){

        rotated =
            m[0].map((_,i)=>
                m.map(r=>r[i]).reverse()
            );

    }else{

        rotated =
            m[0].map((_,i)=>
                m.map(r=>r[r.length-1-i])
            );
    }

    const kicks = [0,-1,1,-2,2];

    for(const kick of kicks){

        if(!collide(kick,0,rotated)){

			piece.matrix = rotated;
			
			soundRotate();
			
			piece.x += kick;
			
			if(touchingGround){
			
				lockTimer = 0;
			}
			
			lastMoveRotate = true;
			
			return;
        }
    }
}

function lockPiece(){

    merge();

    clearLines();

    spawn();

    canHold = true;

    lockTimer = 0;

    touchingGround = false;
}

function moveDown(){

    if(!collide(0,1)){

        piece.y++;

        touchingGround = false;

        lockTimer = 0;

    }else{

        touchingGround = true;
    }

    dropCounter = 0;
}

function hardDrop(){

    if(!piece) return;

	soundDrop();

    while(!collide(0,1)){

        piece.y++;
    }

    // score bonus for hard drop distance
    // optional:
    // score += 2;

    lastMoveRotate = false;

    // fully reset ground state BEFORE locking
    touchingGround = false;
    lockTimer = 0;
    dropCounter = 0;

    // lock instantly
    merge();

    clearLines();

    canHold = true;

    spawn();

    // reset again after spawn
    touchingGround = false;
    lockTimer = 0;
    dropCounter = 0;
}

function hold(){

    if(!canHold) return;
	
	soundHold();

    if(!holdPiece){

        holdPiece = piece.type;

        spawn();

    }else{

        const temp = holdPiece;

        holdPiece = piece.type;

        piece = createPiece(temp);
    }

    canHold = false;
}

function lighten(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = ((num >> 8) & 0x00ff) + amt,
        B = (num & 0x0000ff) + amt;

    return `rgb(${clamp(R)},${clamp(G)},${clamp(B)})`;
}

function darken(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) - amt,
        G = ((num >> 8) & 0x00ff) - amt,
        B = (num & 0x0000ff) - amt;

    return `rgb(${clamp(R)},${clamp(G)},${clamp(B)})`;
}

function clamp(v) {
    return Math.max(0, Math.min(255, v));
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawBlock(ctx, x, y, color, size, alpha = 1) {

    const px = x * size;
    const py = y * size;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Base gradient (gives depth)
    const grad = ctx.createLinearGradient(px, py, px + size, py + size);
    grad.addColorStop(0, lighten(color, 25));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darken(color, 35));

    ctx.fillStyle = grad;

    // Rounded block (modern feel)
    roundRect(ctx, px + 1, py + 1, size - 2, size - 2, 6);
    ctx.fill();

    // Inner highlight (top-left shine)
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);

    // Subtle shadow edge
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(px, py, size, size);
	
	ctx.shadowColor =
		currentSkin.blockGlow;
	
	ctx.shadowBlur = 10;

    ctx.restore();
}

function drawGhost(){

    let ghostY = piece.y;

    while(
        !collide(
            0,
            ghostY-piece.y+1
        )
    ){
        ghostY++;
    }

    piece.matrix.forEach((row,y)=>{

        row.forEach((v,x)=>{

            if(v){

                drawBlock(
                    ctx,
                    piece.x+x,
                    ghostY+y,
                    COLORS[piece.type],
                    SIZE,
                    currentSkin.ghostAlpha
                );
            }
        });
    });
}

function draw(){

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    board.forEach((row,y)=>{

        row.forEach((v,x)=>{

            if(v){

                drawBlock(
                    ctx,
                    x,
                    y,
                    COLORS[v],
                    SIZE
                );
            }
        });
    });

    if(piece){

        drawGhost();
		
		ctx.shadowColor =
			currentSkin.blockGlow;
		
		ctx.shadowBlur = 18;

        piece.matrix.forEach((row,y)=>{

            row.forEach((v,x)=>{

                if(v){

                    drawBlock(
                        ctx,
                        piece.x+x,
                        piece.y+y,
                        COLORS[piece.type],
                        SIZE
                    );
                }
            });
        });
    }

    drawMini(nextCtx,nextPiece);

    drawMini(holdCtx,holdPiece);

    drawEnemies();
	
	if(messageTimer > 0){
	
		ctx.fillStyle = "#00f0ff";
	
		ctx.font = "bold 28px Consolas";
	
		ctx.textAlign = "center";
	
		ctx.fillText(
			message,
			canvas.width/2,
			120
		);
	
		messageTimer--;
	}
}

function drawMini(ctx2,type){

    ctx2.clearRect(0,0,80,80);

    if(!type) return;

    const mat = SHAPES[type];

    mat.forEach((row,y)=>{

        row.forEach((v,x)=>{

            if(v){

                drawBlock(
                    ctx2,
                    x+1,
                    y+1,
                    COLORS[type],
                    15
                );
            }
        });
    });
}

function drawEnemies(){

    Object.values(opponents)
        .forEach(enemy=>{

        const ctx = enemy.ctx;

        ctx.clearRect(
            0,
            0,
            120,
            240
        );

        if(!enemy.grid) return;

        enemy.grid.forEach((row,y)=>{

            row.forEach((v,x)=>{

                if(v){

                    ctx.fillStyle =
                        COLORS[v] || "#999";

                    ctx.fillRect(
                        x*12,
                        y*12,
                        12,
                        12
                    );
                }
            });
        });
    });
}

function update(time=0){

    if(!running) return;

    const delta = time-lastTime;

    lastTime = time;

	if(!paused && !matchEnded){
	
		dropCounter += delta;
	
		if(dropCounter > dropInterval){
			moveDown();
		}
	
		if(touchingGround){
			lockTimer += delta;
	
			if(lockTimer >= lockDelay){
				lockPiece();
			}
		}
	
		networkTimer += delta;
	
		if(networkTimer > 100){
			networkTimer = 0;
	
			if(multiplayer && room && boardDirty){
				boardDirty = false;
	
				socket.emit("board", {
					room,
					board
				});
			}
		}
	}

    draw();

    animationId =
        requestAnimationFrame(update);
}

function startGame(){

	startMusic();

    // hard reset game state
    matchEnded = false;

    paused = false;
    running = false;

    cancelAnimationFrame(animationId);

    piece = null;

    touchingGround = false;
    lockTimer = 0;

    dropCounter = 0;
    lastTime = 0;

    boardDirty = true;

    // reset opponents
    opponents = {};
    opponentsContainer.innerHTML = "";

    gameStarted = true;

    paused = false;

    running = true;

    // fresh board
    resetBoard();

    // reset score state
    score = 0;
    lines = 0;
    level = 1;

    combo = -1;
    backToBack = false;

    // reset fall speed
    dropInterval = 1000;

    // reset hold
    holdPiece = null;
    canHold = true;

    // update ui
    updateUI();

    // switch screens
    document.getElementById("menu")
        .style.display = "none";

    document.getElementById("gameArea")
        .style.display = "flex";

    // chat handling
    if(multiplayer){

        showMatchChat();

    }else{

        showLobbyChat();
    }

    // reset randomizer
    bag = [];

    // create first pieces
    nextPiece = randomType();

    spawn();

    // start fresh loop
    animationId =
        requestAnimationFrame(update);
}

function restartGame(){

    if(multiplayer) return;

    startGame();
}

function surrender(){

    if(!multiplayer) return;

    running = false;

    cancelAnimationFrame(animationId);

    socket.emit("surrender",room);

    alert("YOU SURRENDERED");

    showMenu();
}

function togglePause(){

    if(!running) return;

    if(multiplayer){

        surrender();
        return;
    }

    paused = !paused;

    soloPauseMenuOpen = paused;

    document.getElementById(
        "soloPauseMenu"
    ).style.display =
        paused ? "flex" : "none";

    // ✅ STOP / RESUME MUSIC
    if(paused){

        stopMusic();

    }else{

        startMusic();
    }
}

function continueSoloGame(){

    soundClick();

    paused = false;

    soloPauseMenuOpen = false;

    document.getElementById(
        "soloPauseMenu"
    ).style.display = "none";
}

function restartSoloGame(){

    soundClick();

    paused = false;

    soloPauseMenuOpen = false;

    document.getElementById(
        "soloPauseMenu"
    ).style.display = "none";

    restartGame();
}

function quitSoloGame(){

    soundClick();

    paused = false;

    soloPauseMenuOpen = false;

    document.getElementById(
        "soloPauseMenu"
    ).style.display = "none";

    backToMenu();
}

function openSettings(){

    soundClick();

    document.getElementById(
        "settingsPopup"
    ).style.display = "flex";
}

function closeSettings(){

    soundClick();

    document.getElementById(
        "settingsPopup"
    ).style.display = "none";
}

function gameOver(){

	stopMusic();

	soundGameOver();

    running = false;
    cancelAnimationFrame(animationId);

    if(multiplayer){
	
		addRankPoints(-15);

        socket.emit("lost", room);

        matchEnded = true;

        showMatchChat();
        showMatchEndPanel();

        return;
    }

    setTimeout(()=>{

        alert("GAME OVER\n\nScore: " + score);

        showMenu();

    },100);
}

function startSolo(){

    multiplayer = false;

    room = null;
	
	showLobbyChat();

    startGame();
}

function backToMenu(){

    if(multiplayer){
        alert("Use ESC to surrender in multiplayer.");
        return;
    }

    running = false;
    paused = false;

    cancelAnimationFrame(animationId);

    multiplayer = false;
    room = null;

    matchEnded = false;
    rematchSent = false;
    gameStarted = false;

    piece = null;

    resetBoard();

    opponents = {};
    opponentsContainer.innerHTML = "";

    hideMatchEndPanel();

    showLobbyChat();

    document.getElementById("status").innerText = "READY";
    document.getElementById("menu").style.display = "flex";
    document.getElementById("gameArea").style.display = "none";
    document.getElementById("roomDisplay").innerText = "";
}

function createOpponentBoard(id){

    if(opponents[id]) return;

    const box =
        document.createElement("div");

    box.className = "enemyBox";

    const name =
        document.createElement("div");

    name.className = "enemyName";

    name.innerText =
        "PLAYER";

    const canvas =
        document.createElement("canvas");

    canvas.width = 120;
    canvas.height = 240;

    canvas.className = "enemyCanvas";

    box.appendChild(name);
    box.appendChild(canvas);

    opponentsContainer.appendChild(box);

    opponents[id] = {
        canvas,
        ctx: canvas.getContext("2d"),
        grid:null,
        box
    };
}

function moveLeft(){
    if(!running || paused || matchEnded) return;
    if(!collide(-1,0)){
        piece.x--;
		soundMove();
        lastMoveRotate = false;
        if(touchingGround) lockTimer = 0;
    }
}

function moveRight(){
    if(!running || paused || matchEnded) return;
    if(!collide(1,0)){
        piece.x++;
		soundMove();
        lastMoveRotate = false;
        if(touchingGround) lockTimer = 0;
    }
}

function sendLobbyChat(){

    if(!isLoggedIn)
        return;

    const input =
        document.getElementById(
            "lobbyChatInput"
        );

    const msg =
        input.value.trim();

    if(!msg)
        return;

    socket.emit(
        "lobbyChatMessage",
        {
            username,
            msg
        }
    );

    input.value = "";
}

function sendMatchChat(){

    if(!isLoggedIn) return;
    if(!room) return;

    const input = document.getElementById("matchChatInput");
    const msg = input.value.trim();

    if(!msg) return;

    const payload = {
        room,
        username,
        msg
    };

    socket.emit("matchChatMessage", payload);

    // ✅ SHOW OWN MESSAGE IMMEDIATELY
    addMatchChat(payload);

    input.value = "";
}

document.addEventListener("keydown",e=>{

	if (matchEnded) return;

    const tag = document.activeElement.tagName;
    if(tag === "INPUT") return;

    if(!running || matchEnded) return;

    const preventKeys = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        " ",
        "Spacebar"
    ];

    if(preventKeys.includes(e.key)){

        e.preventDefault();
    }

    if(!running) return;

	if(e.key === "Escape"){
	
		const settings =
			document.getElementById("settingsPopup");
	
		if(settings.style.display === "flex"){
	
			closeSettings();
			return;
		}
	
		togglePause();
		return;
	}

    if(paused) return;

    switch(e.key){

        case "ArrowLeft":

			if(!collide(-1,0)){
			
				piece.x--;
				
				lastMoveRotate = false;
			
				if(touchingGround){
			
					lockTimer = 0;
				}
			}

            break;

        case "ArrowRight":

			if(!collide(1,0)){
			
				piece.x++;
				
				lastMoveRotate = false;
			
				if(touchingGround){
			
					lockTimer = 0;
				}
			}

            break;

        case "ArrowDown":

            moveDown();

            break;

        case "ArrowUp":

            rotate(true);

            break;

        case "z":
        case "Z":

            rotate(false);

            break;

        case " ":
        case "Spacebar":

            hardDrop();

            break;

        case "c":
        case "C":
        case "Shift":

            hold();

            break;
    }
});

// showMenu();

async function fakeLoad(){

    const fill =
        document.getElementById(
            "loadingFill"
        );

    const text =
        document.getElementById(
            "loadingText"
        );

    const steps = [
        "Loading assets...",
        "Loading ranks...",
        "Connecting server...",
        "Preparing battlefield...",
        "Ready!"
    ];

    for(let i=0;i<steps.length;i++){

        text.innerText = steps[i];

        fill.style.width =
            ((i+1)/steps.length)*100 + "%";

        await new Promise(r=>
            setTimeout(r,500)
        );
    }

    document.getElementById(
        "loadingScreen"
    ).style.display = "none";
}

window.addEventListener("load",()=>{

    fakeLoad();
});

window.addEventListener("resize", scaleGame);
window.addEventListener("load", scaleGame);
window.addEventListener("load", () => {

    const saved =
        localStorage.getItem(
            "tetris_username"
        );

    if(saved){

        document.getElementById(
            "usernameInput"
        ).value = saved;
    }
});

scaleGame();

document.getElementById(
    "usernameInput"
).addEventListener("keydown", e => {

    if(e.key === "Enter"){

        login();
    }
});

window.addEventListener("beforeunload",()=>{
    if(multiplayer && room){
        socket.emit("leaveRoom",room);
    }
});

window.addEventListener("focus", () => {
    if (!running && !multiplayer) {
        resetInputLock();
    }
});

function scaleGame() {
    const wrapper = document.getElementById("gameWrapper");
    if (!wrapper) return;

    const baseWidth = 900;
    const baseHeight = 700;

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let scaleX = screenWidth / baseWidth;
    let scaleY = screenHeight / baseHeight;

    let scale = Math.min(scaleX, scaleY);

    // allow stronger zoom-out on mobile
    scale = Math.min(scale, 1);
    scale = Math.max(scale, 0.25);

    wrapper.style.transform = `scale(${scale})`;
}