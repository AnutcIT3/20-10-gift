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
const TABLES = [
  'students',
  'gallery',
  'letters',
  'letter_reactions',
  'student_views',
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

  // Lưới an toàn: snapshot bắt đầu bằng DELETE toàn bộ 5 bảng, nên restore
  // nhầm bản cũ là mất sạch ảnh và avatar vừa làm mà không có gì để lấy lại.
  // Luôn dump dữ liệu hiện có ra file cục bộ (ngoài Git) trước khi ghi đè.
  if (options.preBackup !== false) {
    const { backupData, localOutputFile } = require('./backup');
    const safetyFile = localOutputFile();
    const pool = mysql.createPool(dbConfig);
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
    await connection.beginTransaction();
    await connection.query(sql);
    await connection.query(
      'UPDATE app_data_revision SET revision = revision + 1 WHERE id = 1'
    );
    await connection.commit();

    const counts = {};
    for (const table of TABLES) {
      const [[result]] = await connection.query(
        `SELECT COUNT(*) AS count FROM \`${table}\``
      );
      counts[table] = Number(result.count);
      logger?.log(`- ${table}: ${result.count}`);
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
