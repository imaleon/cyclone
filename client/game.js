const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const enemyCanvas = document.getElementById("enemy");
const enemyCtx = enemyCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");

const COLS = 10;
const ROWS = 20;
const BLOCK = 24;

const colors = {
  I: '#00FFFF',
  J: '#0000FF',
  L: '#FF8800',
  O: '#FFFF00',
  S: '#00FF00',
  T: '#AA00FF',
  Z: '#FF0000',
  X: '#666666'
};

const shapes = {
  I: [[1,1,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0]],
  T: [[0,1,0],[1,1,1]],
  Z: [[1,1,0],[0,1,1]]
};

};