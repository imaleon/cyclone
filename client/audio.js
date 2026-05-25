const audioCtx =
    new (
        window.AudioContext ||
        window.webkitAudioContext
    )();

function beep(
    freq = 440,
    duration = 0.08,
    type = "square",
    volume = 0.03
){

    const osc =
        audioCtx.createOscillator();

    const gain =
        audioCtx.createGain();

    osc.type = type;

    osc.frequency.value = freq;

    gain.gain.value = volume;

    osc.connect(gain);

    gain.connect(audioCtx.destination);

    osc.start();

    osc.stop(
        audioCtx.currentTime + duration
    );
}

// SOUND EFFECTS
function soundMove(){

    beep(220,0.03,"square",0.02);
}

function soundRotate(){

    beep(520,0.05,"triangle",0.03);
}

function soundDrop(){

    beep(120,0.08,"sawtooth",0.04);
}

function soundClear(){

    beep(700,0.05,"square",0.03);

    setTimeout(()=>{
        beep(900,0.08,"square",0.03);
    },50);
}

function soundHold(){

    beep(300,0.04,"triangle",0.025);
}

function soundGarbage(){

    beep(80,0.15,"sawtooth",0.05);
}

function soundGameOver(){

    beep(300,0.15,"square",0.03);

    setTimeout(()=>{
        beep(220,0.2,"square",0.03);
    },120);

    setTimeout(()=>{
        beep(140,0.3,"square",0.03);
    },240);
}

function soundWin(){

    beep(523,0.08,"triangle",0.03);

    setTimeout(()=>{
        beep(659,0.08,"triangle",0.03);
    },80);

    setTimeout(()=>{
        beep(784,0.15,"triangle",0.03);
    },160);
}

function soundClick(){

    beep(450,0.03,"square",0.02);
}

function startMusic(){

    const notes = [
        659,494,523,587,
        523,494,440,440,
        523,659,587,523,
        494,523,587,659
    ];

    let i = 0;

    clearInterval(musicInterval);

    musicInterval = setInterval(()=>{

        beep(
            notes[i % notes.length],
            0.12,
            "square",
            0.02
        );

        i++;

    },180);
}

function stopMusic(){

    clearInterval(musicInterval);
}