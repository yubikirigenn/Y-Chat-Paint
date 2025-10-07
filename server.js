const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// publicフォルダ内のファイルを静的ファイルとして提供する
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('a user connected');

  // クライアントから 'draw' というメッセージを受け取ったときの処理
  socket.on('draw', (data) => {
    // 送信してきたクライアント以外の全員に描画データを送信する
    socket.broadcast.emit('draw', data);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

// Renderが指定するポート、またはローカル開発用のポート3000でサーバーを起動
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
