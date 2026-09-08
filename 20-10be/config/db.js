const mysql = require('mysql2/promise');
require('dotenv').config();
const buildSslOption = require('./dbSsl');

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing DB env: ${key}`);
  }
}

const ssl = buildSslOption();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  // Aiven free cho 76 kết nối: 2 máy × 30 = 60, chừa phần còn lại cho
  // db:check / backup / migrate và nội bộ Aiven. Mỗi vòng tới Aiven ~76 ms nên
  // pool rộng mới cho 40 người mở trang cùng lúc mà không phải xếp hàng.
  connectionLimit: 30,
  queueLimit: 0,
  ...(ssl ? { ssl } : {}),
  // Chủ động đóng kết nối rảnh trước khi máy chủ cloud tự ngắt
  // (Aiven ~10 phút, TiDB 340 giây) để tránh lỗi "connection lost" rải rác
  idleTimeout: 120000,
  enableKeepAlive: true,
  // DATETIME (reveal_at) được ghi dạng chuỗi UTC; parse lại cũng phải theo UTC
  // để giá trị không lệch theo múi giờ của máy chạy Node
  timezone: 'Z',
});

// Đưa múi giờ phiên MySQL về UTC để TIMESTAMP (created_at...) trả về khớp với
// cách parse UTC ở trên, bất kể múi giờ server MySQL (thường +07:00 ở VN)
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

module.exports = pool;
