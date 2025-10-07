const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let isDrawing = false;
let lastX = 0;
let lastY = 0;

// 線を描画する関数
function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round'; // 線の端を丸くする
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.closePath();
}

// 自分がマウスで描画したときの処理
canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const data = {
    x1: lastX,
    y1: lastY,
    x2: e.offsetX,
    y2: e.offsetY
  };
  drawLine(data.x1, data.y1, data.x2, data.y2); // 自分の画面にも描画
  socket.emit('draw', data); // 他のユーザーに描画情報を送信
  [lastX, lastY] = [e.offsetX, e.offsetY];
});

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

// 他のユーザーが描画した情報を受け取ったときの処理
socket.on('draw', (data) => {
  drawLine(data.x1, data.y1, data.x2, data.y2);
});
