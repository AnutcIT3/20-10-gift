#!/usr/bin/env node
/**
 * scripts/restore.js
 * Khôi phục database từ file backup SQL.
 * Chạy: npm run restore -- backups/backup-2024-10-20-00-00-00.sql
 *    hoặc (file mới nhất): npm run restore
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function getLatestBackup() {
  if (!fs.existsSync(BACKUPS_DIR)) return null;
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  return files[0] ? path.join(BACKUPS_DIR, files[0]) : null;
}

async function main() {
  // Lấy file từ argument hoặc file mới nhất
  let file = process.argv[2];
  if (!file) {
    file = getLatestBackup();
    if (!file) {
      console.error('[LOI] Khong tim thay file backup trong thu muc backups/');
      process.exit(1);
    }
    console.log(`  Su dung backup moi nhat: ${path.basename(file)}`);
  } else if (!path.isAbsolute(file)) {
    file = path.resolve(process.cwd(), file);
  }

  if (!fs.existsSync(file)) {
    console.error(`[LOI] Khong tim thay file: ${file}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(file, 'utf8');

  // Tach thanh cac lenh SQL rieng le (phan theo ";")
  const statements = sql
    .split('\n')
    .filter((l) => !l.startsWith('--') && l.trim())
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`\n  Restoring ${statements.length} statements from ${path.basename(file)}...`);

  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    console.log('\n✓ Restore hoan thanh!');
    console.log('  Chay "npm run migrate" neu chua co schema.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => { console.error('[LOI]', err.message); process.exit(1); });
