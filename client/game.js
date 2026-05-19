const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const enemyCanvas = document.getElementById('enemy');
const enemyCtx = enemyCanvas.getContext('2d');

const ROWS = 20;
const COLS = 10;
const SIZE = 30;

const COLORS = [
    null,
    '#00FFFF',
    '#0000FF',
    '#FFA500',
    '#FFFF00',
    '#00FF00',
    '#800080',
    '#FF0000'
];

const SHAPES = [
    [],
    [[1,1,1,1]],
    [[2,0,0],[2,2,2]],
    [[0,0,3],[3,3,3]],
    [[4,4],[4,4]],
    [[0,5,5],[5,5,0]],
    [[0,6,0],[6,6,6]],
    [[7,7,0],[0,7,7]]
];

let grid = [];
let player = null;

let score = 0;
update();