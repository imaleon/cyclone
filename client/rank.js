const RANK_SKINS = {
    BRONZE: {
        blockGlow: "#cd7f32",
        ghostAlpha: 0.15,
        boardBorder: "#7a4b1d",
        particle: "#cd7f32",
        background:
            "radial-gradient(circle,#24150b,#030409)"
    },

    SILVER: {
        blockGlow: "#c0c0c0",
        ghostAlpha: 0.18,
        boardBorder: "#888",
        particle: "#c0c0c0",
        background:
            "radial-gradient(circle,#1a1f28,#030409)"
    },

    GOLD: {
        blockGlow: "#ffd700",
        ghostAlpha: 0.2,
        boardBorder: "#ffcc00",
        particle: "#ffd700",
        background:
            "radial-gradient(circle,#2d2300,#030409)"
    },

    PLATINUM: {
        blockGlow: "#66ffff",
        ghostAlpha: 0.22,
        boardBorder: "#00ffff",
        particle: "#66ffff",
        background:
            "radial-gradient(circle,#002929,#030409)"
    },

    DIAMOND: {
        blockGlow: "#7f7fff",
        ghostAlpha: 0.24,
        boardBorder: "#7f7fff",
        particle: "#aab0ff",
        background:
            "radial-gradient(circle,#15153a,#030409)"
    },

    MASTER: {
        blockGlow: "#ff44cc",
        ghostAlpha: 0.26,
        boardBorder: "#ff44cc",
        particle: "#ff44cc",
        background:
            "radial-gradient(circle,#2a0026,#030409)"
    },

    GRANDMASTER: {
        blockGlow: "#ff0033",
        ghostAlpha: 0.3,
        boardBorder: "#ff0033",
        particle: "#ff3355",
        background:
            "radial-gradient(circle,#3a0000,#030409)"
    }
};

function calculateRank(points){

    if(points >= 3000) return "GRANDMASTER";
    if(points >= 2000) return "MASTER";
    if(points >= 1400) return "DIAMOND";
    if(points >= 900) return "PLATINUM";
    if(points >= 500) return "GOLD";
    if(points >= 250) return "SILVER";
	if(points >= 249) return "BRONZE";

}

function addRankPoints(amount){

    rankPoints += amount;

    if(rankPoints < 0)
        rankPoints = 0;

    const oldRank = playerRank;

    playerRank =
        calculateRank(rankPoints);

    if(
        !unlockedRanks.includes(playerRank)
    ){

        unlockedRanks.push(playerRank);

        localStorage.setItem(
            "tetris_unlocked_ranks",
            JSON.stringify(unlockedRanks)
        );

        showRankUnlock(playerRank);
    }

    localStorage.setItem(
        "tetris_rank_points",
        rankPoints
    );

    updateUI();
}

function applyRankSkin(){

    document.body.style.background =
        currentSkin.background;

    canvas.style.border =
        `3px solid ${currentSkin.boardBorder}`;

    document.documentElement.style.setProperty(
        "--cyan",
        currentSkin.blockGlow
    );
}

function showRankUnlock(rank){

    const popup =
        document.createElement("div");

    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform =
        "translate(-50%,-50%)";

    popup.style.background = "#0d1025";
    popup.style.border =
        `3px solid ${currentSkin.blockGlow}`;

    popup.style.padding = "25px";
    popup.style.borderRadius = "15px";
    popup.style.zIndex = "999999";
    popup.style.textAlign = "center";

    popup.innerHTML = `
        <h2 style="
            color:${currentSkin.blockGlow};
            margin-top:0;
        ">
            NEW SKIN UNLOCKED
        </h2>

        <div style="
            font-size:1.4rem;
            margin-top:10px;
        ">
            ${rank}
        </div>
    `;

    document.body.appendChild(popup);

    setTimeout(()=>{
        popup.remove();
    },3000);
}