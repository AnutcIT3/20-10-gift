#!/usr/bin/env node
/**
 * scripts/backup.js
 * Xuất toàn bộ data từ MySQL ra file SQL có thể commit lên Git.
 * Chạy: npm run backup
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const OUTPUT_DIR = path.join(__dirname, '..', 'backups');
const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `backup-${timestamp}.sql`);

// Bảng cần backup theo thứ tự (tránh lỗi foreign key)
const TABLES = ['students', 'gallery', 'letters', 'letter_reactions', 'student_views'];

async function getColumns(table) {
  const [rows] = await pool.execute(`SHOW COLUMNS FROM \`${table}\``);
  return rows.map((r) => r.Field);
}

async function tableToSql(table) {
  const columns = await getColumns(table);
  const [rows] = await pool.execute(`SELECT * FROM \`${table}\``);
  if (!rows.length) return `-- Table \`${table}\`: no data\n`;

  const colList = columns.map((c) => `\`${c}\``).join(', ');
  const escapeVal = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
  };

  const valueLines = rows
    .map((row) => `(${columns.map((c) => escapeVal(row[c])).join(', ')})`)
    .join(',\n  ');

  return (
    `-- Table \`${table}\` (${rows.length} rows)\n` +
    `DELETE FROM \`${table}\`;\n` +
    `INSERT INTO \`${table}\` (${colList}) VALUES\n  ${valueLines};\n`
  );
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const lines = [
    '-- 20-10 Gift — Database Backup',
    `-- Created: ${new Date().toISOString()}`,
    '-- Restore: npm run restore -- <file>',
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  for (const table of TABLES) {
    console.log(`  Backing up: ${table}...`);
    try {
      lines.push(await tableToSql(table));
    } catch (err) {
      console.warn(`  [SKIP] ${table}: ${err.message}`);
    }
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');

  const size = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`\n✓ Backup saved: ${OUTPUT_FILE} (${size} KB)`);
  console.log('  Commit file này lên Git để dùng trên máy khác.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
