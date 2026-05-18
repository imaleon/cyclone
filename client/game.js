const canvas =
    document.getElementById('playerCanvas');

const ctx = canvas.getContext('2d');

const enemyCanvas =
    document.getElementById('enemyCanvas');

const enemyCtx =
    enemyCanvas.getContext('2d');

const COLS = 10;
const ROWS = 20;
const SIZE = 20;

const COLORS = {
    I: '#00ffff',
    J: '#0000ff',
    L: '#ff8800',
    O: '#ffff00',
    S: '#00ff00',
    T: '#aa00ff',
    Z: '#ff0000',
    X: '#666666'
};

const SHAPES = {
    I: [[1,1,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0]],
    T: [[0,1,0],[1,1,1]],
    Z: [[1,1,0],[0,1,1]]
};

let grid = [];

let enemyGrid = [];

let piece = null;

let dropTimer = 0;

let dropInterval = 700;

let lastTime = 0;

function resetGrid() {

    grid = Array.from(
        { length: ROWS },
        () => Array(COLS).fill(0)
    );

    enemyGrid = Array.from(
        { length: ROWS },
        () => Array(COLS).fill(0)
    );

}

function randomPiece() {

    const types = Object.keys(SHAPES);

    const type =
        types[
            Math.floor(
                Math.random() * types.length
            )
        ];

    return {
        type,
        matrix: SHAPES[type],
        x: 3,
        y: 0
    };

}

function drawCell(
    target,
    x,
    y,
    color
) {

    target.fillStyle = color;

    target.fillRect(
        x * SIZE,
        y * SIZE,
        SIZE,
        SIZE
    );

    target.strokeStyle = '#111';

    target.strokeRect(
        x * SIZE,
        y * SIZE,
        SIZE,
        SIZE
    );

}

function drawBoard() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    for (let y = 0; y < ROWS; y++) {

        for (let x = 0; x < COLS; x++) {

            if (grid[y][x]) {

                drawCell(
                    ctx,
                    x,
                    y,
                    COLORS[grid[y][x]]
                );

            }

        }

    }

    if (piece) {

        piece.matrix.forEach((row, y) => {

            row.forEach((value, x) => {

                if (value) {

                    drawCell(
                        ctx,
                        piece.x + x,
                        piece.y + y,
                        COLORS[piece.type]
                    );

                }

            });

        });

    }

}

function drawEnemy() {

    enemyCtx.clearRect(
        0,
        0,
        enemyCanvas.width,
        enemyCanvas.height
    );

    for (let y = 0; y < ROWS; y++) {

        for (let x = 0; x < COLS; x++) {

            if (enemyGrid[y][x]) {

                drawCell(
                    enemyCtx,
                    x,
                    y,
                    COLORS[enemyGrid[y][x]]
                );

            }

        }

    }

}

function collide() {

    for (
        let y = 0;
        y < piece.matrix.length;
        y++
    ) {

        for (
            let x = 0;
            x < piece.matrix[y].length;
            x++
        ) {

            if (
                piece.matrix[y][x] &&
                (
                    grid[y + piece.y] &&
                    grid[y + piece.y][x + piece.x]
                ) !== 0
            ) {
                return true;
            }

        }

    }

    return false;

}

function merge() {

    piece.matrix.forEach((row, y) => {

        row.forEach((value, x) => {

            if (value) {

                grid[y + piece.y][x + piece.x] =
                    piece.type;

            }

        });

    });

}

function rotate() {

    const rotated =
        piece.matrix[0].map((_, i) =>
            piece.matrix.map(
                row => row[i]
            ).reverse()
        );

    const old = piece.matrix;

    piece.matrix = rotated;

    if (collide()) {
        piece.matrix = old;
    }

}

function clearLines() {

    let cleared = 0;

    outer:
    for (
        let y = ROWS - 1;
        y >= 0;
        y--
    ) {

        for (
            let x = 0;
            x < COLS;
            x++
        ) {

            if (!grid[y][x]) {
                continue outer;
            }

        }

        const row =
            grid.splice(y, 1)[0].fill(0);

        grid.unshift(row);

        y++;

        cleared++;

    }

    if (cleared > 1) {
        sendGarbage(cleared - 1);
    }

}

function drop() {

    piece.y++;

    if (collide()) {

        piece.y--;

        merge();

        clearLines();

        piece = randomPiece();

        if (collide()) {

            sendLose();

            alert('YOU LOSE');

            location.reload();

        }

    }

    dropTimer = 0;

}

function hardDrop() {

    while (!collide()) {
        piece.y++;
    }

    piece.y--;

    drop();

}

function update(time = 0) {

    const delta = time - lastTime;

    lastTime = time;

    dropTimer += delta;

    if (dropTimer > dropInterval) {
        drop();
    }

    drawBoard();

    drawEnemy();

    sendBoard();

    requestAnimationFrame(update);

}

function addGarbage(amount) {

    for (let i = 0; i < amount; i++) {

        grid.shift();

        const hole =
            Math.floor(
                Math.random() * COLS
            );

        const garbage =
            Array(COLS).fill('X');

        garbage[hole] = 0;

        grid.push(garbage);

    }

}

function startGame() {

    resetGrid();

    piece = randomPiece();

    update();

}

document.addEventListener(
    'keydown',
    e => {

        if (!piece) return;

        switch (e.key) {

            case 'ArrowLeft':

                piece.x--;

                if (collide()) {
                    piece.x++;
                }

                break;

            case 'ArrowRight':

                piece.x++;

                if (collide()) {
                    piece.x--;
                }

                break;

            case 'ArrowDown':

                drop();

                break;

            case 'ArrowUp':

                rotate();

                break;

            case ' ':

                hardDrop();

                break;

        }

    }
);