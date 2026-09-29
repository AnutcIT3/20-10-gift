#!/usr/bin/env node
/**
 * Restore shared application data from a SQL snapshot.
 * Run: npm run restore
 * Or:  npm run restore -- backups/snapshot.sql
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const buildSslOption = require('../config/dbSsl');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
// Snapshot ghi TIMESTAMP dạng chuỗi UTC (pool của backup chạy phiên +00:00).
// Phiên restore phải cùng múi đó, nếu không MySQL hiểu chuỗi UTC theo múi giờ
// máy (+07 ở VN) và lùi mọi created_at/opened_at 7 tiếng — bông hoa 12A1 sẽ
// đánh rơi các lượt mở quà đầu ngày vì chúng rơi ra trước mốc đếm
const UTC_SESSION = "SET time_zone = '+00:00'";

// Snapshot cũ (trước migration 020) xoá rồi chèn lại letters/students với
// FOREIGN_KEY_CHECKS = 0 nên ON DELETE CASCADE không chạy: dọn tay những hồi
// âm và lượt mở quà trỏ vào thư hay học sinh không còn
const ORPHAN_CLEANUP = [
  `DELETE r FROM letter_replies r LEFT JOIN letters l ON l.id = r.letter_id
   WHERE r.letter_id IS NOT NULL AND l.id IS NULL`,
  `DELETE r FROM letter_replies r LEFT JOIN students s ON s.id = r.student_id
   WHERE s.id IS NULL`,
  `DELETE o FROM gift_opens o LEFT JOIN students s ON s.id = o.student_id
   WHERE s.id IS NULL`,
];

const TABLES = [
  'students',
  'gallery',
  'letters',
  'letter_reactions',
  'student_views',
  'letter_replies',
  'gift_opens',
];

function getDefaultBackup() {
  const canonicalSnapshot = path.join(BACKUPS_DIR, 'current-data.sql');
  if (fs.existsSync(canonicalSnapshot)) {
    return canonicalSnapshot;
  }

  if (!fs.existsSync(BACKUPS_DIR)) {
    return null;
  }

  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((file) => /^backup-.*\.sql$/.test(file))
    .sort()
    .reverse();

  return files.length ? path.join(BACKUPS_DIR, files[0]) : null;
}

function getDatabaseConfig() {
  const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
  );

  if (missingVariables.length) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(', ')}`
    );
  }

  const ssl = buildSslOption();
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
    ...(ssl ? { ssl } : {}),
  };
}

async function restoreData(options = {}) {
  const filePath = options.filePath || getDefaultBackup();
  const logger = options.logger === undefined ? console : options.logger;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(
      'No snapshot found. Run "npm run backup" or pass a .sql file path.'
    );
  }

  const dbConfig = options.connectionConfig || getDatabaseConfig();

  // Lưới an toàn: snapshot bắt đầu bằng DELETE toàn bộ các bảng dùng chung, nên restore
  // nhầm bản cũ là mất sạch ảnh và avatar vừa làm mà không có gì để lấy lại.
  // Luôn dump dữ liệu hiện có ra file cục bộ (ngoài Git) trước khi ghi đè.
  if (options.preBackup !== false) {
    const { backupData, localOutputFile } = require('./backup');
    const safetyFile = localOutputFile();
    const pool = mysql.createPool({ ...dbConfig, timezone: 'Z' });
    pool.on('connection', (poolConnection) => { poolConnection.query(UTC_SESSION); });
    try {
      await backupData({ pool, outputFile: safetyFile, logger: null });
    } finally {
      await pool.end();
    }
    logger?.log(`Dữ liệu hiện tại đã được lưu trước vào: ${safetyFile}`);
  }

  logger?.log(`Restoring shared data from: ${filePath}`);
  const sql = fs.readFileSync(filePath, 'utf8');
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.query(UTC_SESSION);
    await connection.beginTransaction();
    await connection.query(sql);
    for (const cleanup of ORPHAN_CLEANUP) {
      try {
        await connection.query(cleanup);
      } catch (error) {
        // Máy chưa chạy migration 020 thì chưa có bảng để dọn
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      }
    }
    await connection.query(
      'UPDATE app_data_revision SET revision = revision + 1 WHERE id = 1'
    );
    await connection.commit();

    const counts = {};
    for (const table of TABLES) {
      try {
        const [[result]] = await connection.query(
          `SELECT COUNT(*) AS count FROM \`${table}\``
        );
        counts[table] = Number(result.count);
        logger?.log(`- ${table}: ${result.count}`);
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        logger?.log(`- ${table}: (chưa có bảng — chạy "npm run migrate")`);
      }
    }
    logger?.log('Restore completed successfully.');
    return counts;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      await connection.end();
    }
  }
}

async function main() {
  const fileArg = process.argv[2];
  const filePath = fileArg ? path.resolve(process.cwd(), fileArg) : getDefaultBackup();
  await restoreData({ filePath });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Restore failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { TABLES, getDatabaseConfig, getDefaultBackup, restoreData };
