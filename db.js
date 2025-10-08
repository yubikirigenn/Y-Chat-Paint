const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!!! FATAL: Error connecting to the database !!!', err.stack);
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return;
  }
  console.log('✅✅✅ Database connection successful! ✅✅✅');
  client.release();
});

const initDb = async () => {
  try {
    // roomsテーブル: 部屋の基本情報を保存
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        thumbnail TEXT
      );
    `);
    // strokesテーブル: 各部屋の描画履歴（線一本一本）を保存
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strokes (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        x1 REAL, y1 REAL, x2 REAL, y2 REAL,
        color VARCHAR(7),
        line_width REAL,
        is_eraser BOOLEAN,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[DB-INIT] Database tables are ready.');
  } catch (err) {
    console.error('[DB-INIT] Error initializing database', err.stack);
  }
};

module.exports = { pool, initDb };