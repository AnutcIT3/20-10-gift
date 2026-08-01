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

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
  };
}

async function main() {
  const fileArg = process.argv[2];
  const filePath = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : getDefaultBackup();

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(
      'No snapshot found. Run "npm run backup" or pass a .sql file path.'
    );
  }

  console.log(`Restoring shared data from: ${filePath}`);
  const sql = fs.readFileSync(filePath, 'utf8');
  const connection = await mysql.createConnection(getDatabaseConfig());

  try {
    await connection.beginTransaction();
    await connection.query(sql);
    await connection.commit();

    console.log('Restore completed successfully:');
    for (const table of TABLES) {
      const [[result]] = await connection.query(
        `SELECT COUNT(*) AS count FROM \`${table}\``
      );
      console.log(`- ${table}: ${result.count}`);
    }
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

main().catch((error) => {
  console.error('Restore failed:', error.message);
  process.exitCode = 1;
});
