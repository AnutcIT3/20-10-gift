#!/usr/bin/env node
/**
 * Đặt lời chúc riêng của từng bạn lên trang quà, từ file JSON.
 *
 *   npm run wishes:import            # xem trước, KHÔNG ghi gì
 *   npm run wishes:import -- --ghi   # ghi thật
 *
 * Lời chúc vào cột students.intro_message — chỗ hiện ngay dưới tên trên trang
 * quà, thay cho câu mẫu giống nhau cho cả lớp.
 *
 * Tên trong file phải trùng ĐÚNG full_name trong bảng students, giữ nguyên dấu:
 * lớp có cả "Thúy" lẫn "Thủy", cả "Phương" lẫn "Phượng". Đối chiếu tên làm ở
 * JavaScript chứ không đưa vào câu SQL, vì collation của MySQL không phân biệt
 * dấu — để MySQL so tên là đặt lời chúc nhầm người. Tên không khớp thì báo và
 * bỏ qua, không đoán.
 *
 * Nếu cùng nội dung đó đang nằm ở mục lời chúc phía dưới (lần nhập trước đặt
 * nhầm chỗ), script gỡ luôn để một câu không hiện hai lần trên cùng một trang.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const DEFAULT_FILE = path.join(__dirname, '..', 'content', 'loi-chuc-ban-nam.json');
const PREVIEW = 60;

function readDoc(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(`Không đọc được file: ${file}`);
  }
  const doc = JSON.parse(raw);
  if (!Array.isArray(doc.wishes) || !doc.wishes.length) {
    throw new Error('File phải có mảng "wishes" với ít nhất một lời chúc');
  }
  return doc;
}

function short(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > PREVIEW ? `${clean.slice(0, PREVIEW)}…` : clean || '(trống)';
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--ghi');
  const file = args.find((arg) => !arg.startsWith('--')) || DEFAULT_FILE;

  const doc = readDoc(file);

  const [students] = await pool.query(
    'SELECT id, full_name, intro_message FROM students WHERE is_active = TRUE',
  );
  const byName = new Map(students.map((student) => [student.full_name.trim(), student]));

  const toWrite = [];
  const unchanged = [];
  const missing = [];

  for (const wish of doc.wishes) {
    const name = String(wish.name || '').trim();
    const content = String(wish.content || '').trim();
    if (!name || !content) throw new Error(`Thiếu name hoặc content: ${JSON.stringify(wish)}`);

    const student = byName.get(name);
    if (!student) { missing.push(name); continue; }
    if ((student.intro_message || '').trim() === content) { unchanged.push(name); continue; }
    toWrite.push({ id: student.id, name, content, before: student.intro_message });
  }

  // Cùng một câu đang nằm ở mục lời chúc phía dưới thì gỡ đi
  const contents = toWrite.concat(unchanged.map((name) => {
    const student = byName.get(name);
    return { id: student.id, content: (student.intro_message || '').trim() };
  }));
  const [dupes] = contents.length
    ? await pool.query(
      `SELECT l.id, s.full_name, l.content FROM letters l JOIN students s ON s.id = l.student_id
       WHERE (l.student_id, l.content) IN (?)`,
      [contents.map((item) => [item.id, item.content])],
    )
    : [[]];

  console.log(`File   : ${file}`);
  console.log(`Sẽ ghi : ${toWrite.length} lời chúc vào ô trên cùng của trang quà\n`);
  for (const item of toWrite) {
    console.log(`  ${item.name}`);
    console.log(`    cũ : ${short(item.before)}`);
    console.log(`    mới: ${short(item.content)}`);
  }
  if (unchanged.length) console.log(`\nĐã đúng rồi: ${unchanged.join(', ')}`);
  if (dupes.length) console.log(`\nSẽ gỡ ${dupes.length} lời chúc trùng ở mục phía dưới: ${dupes.map((row) => row.full_name).join(', ')}`);
  if (missing.length) {
    console.log(`\nKHÔNG KHỚP TÊN NÀO (bỏ qua): ${missing.join(', ')}`);
    console.log('Sửa "name" trong file cho trùng đúng full_name rồi chạy lại.');
  }

  if (!write) {
    console.log('\nĐây mới là xem trước. Thêm --ghi để ghi vào database.');
    return;
  }
  if (!toWrite.length && !dupes.length) {
    console.log('\nKhông có gì để đổi.');
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of toWrite) {
      await connection.execute('UPDATE students SET intro_message = ? WHERE id = ?', [item.content, item.id]);
    }
    for (const row of dupes) {
      await connection.execute('DELETE FROM letters WHERE id = ?', [row.id]);
    }
    await connection.commit();
    console.log(`\nĐã ghi ${toWrite.length} lời chúc, gỡ ${dupes.length} bản trùng.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('Lỗi:', error.message);
    await pool.end();
    process.exit(1);
  });
