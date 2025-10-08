// =====================================================================
// Y-Chat Paint - Final Client-Side Script (v10 - True High-Resolution Data)
// =====================================================================

// グローバル変数
const socket = io();
const canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let dpr = window.devicePixelRatio || 1;
let isDrawing = false, lastX = 0, lastY = 0, currentColor = '#000000', currentLineWidth = 5, isEraser = false;

// HTML要素の参照
const roomListPage = document.getElementById('room-list-page');
const paintPage = document.getElementById('paint-page');
const roomNameInput = document.getElementById('room-name-input');
const createRoomButton = document.getElementById('create-room-button');
const backToTopButton = document.getElementById('back-to-top-button');
const colorPicker = document.getElementById('color-picker');
const lineWidthSlider = document.getElementById('line-width-slider');
const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');
const clearButton = document.getElementById('clear-button');

/**
 * Canvasを高解像度ディスプレイに対応させるための初期化関数。
 * 描画バッファのサイズを物理ピクセルに合わせるだけ。
 */
function setupCanvas() {
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
      console.error("Canvas setup failed: element has no size.");
      return;
  }
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx = canvas.getContext('2d');
  console.log(`[CANVAS-SETUP] Canvas initialized. DPR: ${dpr}, Buffer Size: ${canvas.width}x${canvas.height}`);
}

/**
 * 描画関数。受け取った【物理ピクセル座標】と【物理ピクセル太さ】でそのまま描画する。
 */
function drawLine(x1, y1, x2, y2, color, lineWidth, eraserMode) {
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = eraserMode ? '#FFFFFF' : color;
  ctx.lineWidth = lineWidth;
  ctx.globalCompositeOperation = eraserMode ? 'destination-out' : 'source-over';
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.closePath();
  ctx.globalCompositeOperation = 'source-over';
}

function showView(viewName) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.getElementById(viewName).classList.add('active');
}

function joinRoom(roomName) {
  const trimmedName = roomName.trim();
  if (!trimmedName) { alert('部屋名を入力してください。'); return; }
  
  socket.once('load_history', (history) => {
    showView('paint-page');
    setTimeout(() => {
        setupCanvas();
        history.forEach(data => {
            // DBから来たデータはすでに高解像度なので、そのまま描画
            drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.line_width, data.is_eraser);
        });
        scheduleThumbnailUpdate();
    }, 0);
  });
  socket.emit('join_room', trimmedName);
}

let thumbnailUpdateTimer;
function scheduleThumbnailUpdate() {
  clearTimeout(thumbnailUpdateTimer);
  thumbnailUpdateTimer = setTimeout(() => {
    const thumbnail = canvas.toDataURL('image/png'); 
    socket.emit('update_thumbnail', { thumbnail });
  }, 1000);
}

// =====================================================================
// イベントリスナーの登録
// =====================================================================

createRoomButton.addEventListener('click', () => { joinRoom(roomNameInput.value); roomNameInput.value = ''; });
backToTopButton.addEventListener('click', () => { socket.emit('leave_room'); showView('room-list-page'); });
colorPicker.addEventListener('change', (e) => currentColor = e.target.value);
lineWidthSlider.addEventListener('input', (e) => currentLineWidth = parseInt(e.target.value, 10));
penButton.addEventListener('click', () => { isEraser = false; penButton.classList.add('active'); eraserButton.classList.remove('active'); });
eraserButton.addEventListener('click', () => { isEraser = true; eraserButton.classList.add('active'); penButton.classList.remove('active'); });
clearButton.addEventListener('click', () => {
  if(confirm('キャンバスを本当にきれいにしますか？')) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear_canvas');
    scheduleThumbnailUpdate();
  }
});

// マウスイベントから取得するCSSピクセル座標を、ここで物理ピクセルに変換する
canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  lastX = e.offsetX * dpr;
  lastY = e.offsetY * dpr;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  
  // ★★★【最重要修正】現在の座標も物理ピクセルに変換★★★
  const currentX = e.offsetX * dpr;
  const currentY = e.offsetY * dpr;
  // ★★★【最重要修正】線の太さも物理ピクセルに変換★★★
  const physicalLineWidth = currentLineWidth * dpr;

  // 描画用のデータを作成
  const drawData = {
      x1: lastX, y1: lastY, 
      x2: currentX, y2: currentY, 
      color: currentColor, 
      lineWidth: physicalLineWidth, // 物理ピクセルでの太さ
      eraser: isEraser
  };
  
  // まず自分の画面に描画
  drawLine(drawData.x1, drawData.y1, drawData.x2, drawData.y2, drawData.color, drawData.lineWidth, drawData.eraser);
  
  // ★★★【最重要修正】サーバーに送信するデータも、高解像度の物理ピクセルデータにする★★★
  // サーバー側のDBテーブル(strokes)のカラム名と合わせる
  const strokeDataForServer = {
      x1: drawData.x1,
      y1: drawData.y1,
      x2: drawData.x2,
      y2: drawData.y2,
      color: drawData.color,
      line_width: drawData.lineWidth, // DBのカラム名は line_width
      is_eraser: drawData.eraser     // DBのカラム名は is_eraser
  };
  socket.emit('draw', strokeDataForServer);
  
  // 次の描画のために、現在の物理ピクセル座標を保存
  lastX = currentX;
  lastY = currentY;
});

const stopDrawing = () => { if (!isDrawing) return; isDrawing = false; scheduleThumbnailUpdate(); };
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// =====================================================================
// Socket.IO イベントリスナー
// =====================================================================

socket.on('update_room_list', (rooms) => { /* ... 変更なし ... */ });
socket.on('draw', (data) => {
  // サーバーから来るデータはすでに高解像度なので、そのまま描画
  drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.line_width, data.is_eraser);
});
socket.on('clear_canvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

showView('room-list-page');