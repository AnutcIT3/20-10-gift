#!/usr/bin/env node
/**
 * Export the shared application data to a canonical SQL snapshot.
 * Run: npm run backup
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const pool = require('../config/db');

const OUTPUT_DIR = path.join(__dirname, '..', 'backups');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'current-data.sql');
const TABLES = [
  'students',
  'gallery',
  'letters',
  'letter_reactions',
  'student_views',
];

function escapeValue(value) {
  if (value instanceof Date) {
    return mysql.escape(value.toISOString().slice(0, 19).replace('T', ' '));
  }
  return mysql.escape(value);
}

async function tableToSql(connection, table) {
  const [rows, fields] = await connection.query(
    `SELECT * FROM \`${table}\` ORDER BY \`id\``
  );
  const deleteSql = `DELETE FROM \`${table}\`;`;

  if (!rows.length) {
    return `-- Table: ${table} (0 rows)\n${deleteSql}\n`;
  }

  const columns = fields.map((field) => `\`${field.name}\``).join(', ');
  const values = rows
    .map((row) => {
      const rowValues = fields
        .map((field) => escapeValue(row[field.name]))
        .join(', ');
      return `(${rowValues})`;
    })
    .join(',\n');

  return `-- Table: ${table} (${rows.length} rows)\n${deleteSql}\nINSERT INTO \`${table}\` (${columns}) VALUES\n${values};\n`;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const connection = await pool.getConnection();

  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

    const tableBlocks = [];
    for (const table of TABLES) {
      console.log(`Backing up ${table}...`);
      tableBlocks.push(await tableToSql(connection, table));
    }

    await connection.commit();

    const lines = [
      '-- 20-10 Gift - Shared Data Snapshot',
      '-- Restore: npm run migrate && npm run restore',
      '-- Excludes admins, secrets, and schema_migrations.',
      '',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
      ...tableBlocks,
      'SET FOREIGN_KEY_CHECKS = 1;',
      '',
    ];

    fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');
    const size = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
    console.log(`\nShared data snapshot updated: ${OUTPUT_FILE} (${size} KB)`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Backup failed:', error.message);
  process.exitCode = 1;
});
