#!/usr/bin/env node
/**
 * Kiểm tra máy này đang nối vào database nào và kết nối có tốt không.
 * Run: npm run db:check
 *
 * Không in mật khẩu. Dùng để xác nhận cả hai máy trỏ vào cùng một nơi.
 */

require('dotenv').config();
const pool = require('../config/db');

async function main() {
  const sslOn = String(process.env.DB_SSL || '').toLowerCase() === 'true';
  console.log('Đang nối tới:');
  console.log(`  host     : ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`  database : ${process.env.DB_NAME}`);
  console.log(`  user     : ${process.env.DB_USER}`);
  console.log(`  SSL      : ${sslOn ? `bật${process.env.DB_SSL_CA ? ' (có xác thực CA)' : ' (không xác thực CA)'}` : 'tắt'}`);
  console.log('');

  const started = Date.now();
  const [[version]] = await pool.execute('SELECT VERSION() AS v, @@hostname AS host');
  console.log(`Kết nối OK sau ${Date.now() - started} ms`);
  console.log(`  MySQL    : ${version.v}`);

  // Đo độ trễ trung bình để suy ra vị trí máy chủ
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const t = Date.now();
    await pool.execute('SELECT 1');
    samples.push(Date.now() - t);
  }
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  console.log(`  Độ trễ   : ${avg} ms (${samples.join(', ')} ms)`);
  console.log(`             ${avg < 10 ? '→ máy chủ chạy ngay trên máy này (local)'
    : avg < 60 ? '→ rất tốt, nhiều khả năng Singapore/Đông Nam Á'
      : avg < 120 ? '→ chấp nhận được, nhiều khả năng Nam Á/Đông Á'
        : '→ chậm, máy chủ có thể ở châu Âu hoặc Mỹ'}`);
  console.log('');

  // Trạng thái dữ liệu
  const [tables] = await pool.execute(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?',
    [process.env.DB_NAME],
  );
  console.log(`Số bảng: ${tables[0].n}`);
  if (tables[0].n > 0) {
    for (const table of ['students', 'letters', 'gallery', 'schema_migrations']) {
      try {
        const [[row]] = await pool.execute(`SELECT COUNT(*) AS n FROM \`${table}\``);
        console.log(`  ${table.padEnd(18)}: ${row.n}`);
      } catch {
        console.log(`  ${table.padEnd(18)}: (chưa có)`);
      }
    }
  } else {
    console.log('  (database rỗng — cần chạy "npm run migrate" rồi "npm run restore")');
  }
}

main()
  .catch((error) => {
    console.error('\nKhông kết nối được:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') console.error('→ Sai user hoặc mật khẩu.');
    if (error.code === 'ENOTFOUND') console.error('→ Sai DB_HOST.');
    if (error.code === 'ETIMEDOUT') console.error('→ Không tới được máy chủ: kiểm tra DB_PORT và firewall.');
    if (/SSL|certificate/i.test(error.message)) console.error('→ Vấn đề TLS: kiểm tra DB_SSL / DB_SSL_CA.');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
