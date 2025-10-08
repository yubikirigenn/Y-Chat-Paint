require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const cors = require('cors');
const { Server } = require('socket.io');

const { pool, initDb } = require('./db');

app.use(cors());
app.use(express.static('public'));

const io = new Server(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// メモリ上の部屋キャッシュ（サーバー起動時にDBから復元される）
const roomCache = {};

async function loadRoomsFromDb() {
    try {
        const res = await pool.query('SELECT name, thumbnail FROM rooms');
        res.rows.forEach(row => {
            roomCache[row.name] = { name: row.name, thumbnail: row.thumbnail };
        });
        console.log(`[SERVER-STARTUP] ✅ Success! Loaded ${res.rowCount} rooms from DB into cache.`);
    } catch (err) {
        console.error('[SERVER-STARTUP] ❌ Error loading rooms from DB:', err);
    }
}

async function broadcastRoomList() {
    try {
        const res = await pool.query('SELECT name, thumbnail FROM rooms ORDER BY last_updated_at DESC');
        const roomInfo = res.rows.map(row => {
            const room = io.sockets.adapter.rooms.get(row.name);
            const participantCount = room ? room.size : 0;
            return {
                name: row.name,
                participantCount: participantCount,
                thumbnail: row.thumbnail
            };
        });
        io.emit('update_room_list', roomInfo);
    } catch (err) {
        console.error('Error broadcasting room list', err);
    }
}

io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  socket.on('join_room', async (roomName) => {
    try {
        let roomRes = await pool.query('SELECT id FROM rooms WHERE name = $1', [roomName]);
        let roomId;
        if (roomRes.rowCount === 0) {
            const newRoom = await pool.query('INSERT INTO rooms(name) VALUES($1) RETURNING id', [roomName]);
            roomId = newRoom.rows[0].id;
            roomCache[roomName] = { name: roomName, thumbnail: null };
            broadcastRoomList();
        } else {
            roomId = roomRes.rows[0].id;
        }
        socket.join(roomName);
        socket.currentRoom = { name: roomName, id: roomId };
        const historyRes = await pool.query('SELECT x1, y1, x2, y2, color, line_width, is_eraser FROM strokes WHERE room_id = $1 ORDER BY created_at ASC', [roomId]);
        socket.emit('load_history', historyRes.rows);
    } catch (err) { 
        console.error('❌ Error on join_room:', err); 
    }
  });

  async function updateRoomTimestamp() {
      if(socket.currentRoom) {
          try {
              await pool.query('UPDATE rooms SET last_updated_at = CURRENT_TIMESTAMP WHERE id = $1', [socket.currentRoom.id]);
          } catch(err) {
              console.error('Error updating timestamp', err);
          }
      }
  }

  socket.on('draw', async (data) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom.name).emit('draw', data);
      await updateRoomTimestamp();
      try {
        // ★★★【最重要修正】クライアントから送られてくるキー名に合わせる★★★
        await pool.query(
          'INSERT INTO strokes(room_id, x1, y1, x2, y2, color, line_width, is_eraser) VALUES($1, $2, $3, $4, $5, $6, $7, $8)',
          [socket.currentRoom.id, data.x1, data.y1, data.x2, data.y2, data.color, data.line_width, data.is_eraser] // data.lineWidth -> data.line_width, data.eraser -> data.is_eraser
        );
      } catch (err) { console.error('Error saving stroke to DB', err); }
    }
  });

  socket.on('clear_canvas', async () => {
    if (socket.currentRoom) {
      io.to(socket.currentRoom.name).emit('clear_canvas');
      await updateRoomTimestamp();
      try {
        await pool.query('DELETE FROM strokes WHERE room_id = $1', [socket.currentRoom.id]);
      } catch (err) { console.error('Error clearing history from DB', err); }
    }
  });

  socket.on('update_thumbnail', async (data) => {
    if (socket.currentRoom) {
        try {
            await pool.query('UPDATE rooms SET thumbnail = $1 WHERE id = $2', [data.thumbnail, socket.currentRoom.id]);
            roomCache[socket.currentRoom.name].thumbnail = data.thumbnail;
            await updateRoomTimestamp();
            broadcastRoomList();
        } catch(err) {
            console.error('Error updating thumbnail in DB', err);
        }
    }
  });
  
  socket.on('leave_room', () => {
      if(socket.currentRoom) {
          socket.leave(socket.currentRoom.name);
          socket.currentRoom = null;
          setTimeout(broadcastRoomList, 100);
      }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    setTimeout(broadcastRoomList, 100);
  });
});

setInterval(broadcastRoomList, 10000);

const PORT = process.env.PORT || 3000;
async function startServer() {
    await initDb();
    await loadRoomsFromDb();
    http.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        broadcastRoomList();
    });
}

startServer();