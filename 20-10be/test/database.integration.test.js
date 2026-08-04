const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { run } = require('../scripts/migrate');
const { backupData, TABLES } = require('../scripts/backup');
const { restoreData } = require('../scripts/restore');

const migrationsDir = path.join(__dirname, '..', 'migrations');

function config(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    ...(database ? { database } : {}),
    multipleStatements: true,
    charset: 'utf8mb4',
  };
}

async function databaseSummary(database) {
  const connection = await mysql.createConnection(config(database));
  try {
    const [students] = await connection.execute(
      `SELECT access_code, full_name, is_active, seat_row, seat_col
       FROM students ORDER BY access_code`,
    );
    const counts = {};
    for (const table of TABLES) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      counts[table] = Number(row.count);
    }
    return { students, counts };
  } finally {
    await connection.end();
  }
}

test('fresh and upgraded databases converge, checksums lock history, and backup restores', { timeout: 60000 }, async (t) => {
  let admin;
  try {
    admin = await mysql.createConnection(config());
  } catch (error) {
    t.skip(`MySQL integration unavailable: ${error.message}`);
    return;
  }

  const suffix = `${process.pid}_${Date.now()}`;
  const freshDb = `gift_test_fresh_${suffix}`;
  const upgradeDb = `gift_test_upgrade_${suffix}`;
  const restoreDb = `gift_test_restore_${suffix}`;
  const databases = [freshDb, upgradeDb, restoreDb];
  const snapshot = path.join(os.tmpdir(), `gift-backup-${suffix}.sql`);
  t.after(async () => {
    if (fs.existsSync(snapshot)) fs.unlinkSync(snapshot);
    for (const database of databases) {
      await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    }
    await admin.end();
  });

  const env = { ...process.env };
  await run({ env, database: freshDb, logger: null });

  const legacyFiles = fs.readdirSync(migrationsDir)
    .filter((file) => /^00[1-7].*\.sql$/.test(file))
    .sort();
  await run({ env, database: upgradeDb, files: legacyFiles, logger: null });
  await run({ env, database: upgradeDb, logger: null });

  const freshSummary = await databaseSummary(freshDb);
  const upgradeSummary = await databaseSummary(upgradeDb);
  assert.deepEqual(upgradeSummary, freshSummary);
  assert.equal(freshSummary.students.find((item) => item.access_code === '12a1-huong').seat_col, 3);
  assert.equal(freshSummary.students.find((item) => item.access_code === '12a1-phuong-sac').seat_row, 0);

  const tamper = await mysql.createConnection(config(upgradeDb));
  await tamper.execute(
    "UPDATE schema_migrations SET checksum = ? WHERE filename = '001_create_tables.sql'",
    ['0'.repeat(64)],
  );
  await tamper.end();
  await assert.rejects(
    () => run({ env, database: upgradeDb, logger: null }),
    /Migration checksum mismatch: 001_create_tables\.sql/,
  );

  const freshPool = mysql.createPool(config(freshDb));
  try {
    await backupData({ pool: freshPool, outputFile: snapshot, logger: null });
  } finally {
    await freshPool.end();
  }
  await run({ env, database: restoreDb, logger: null });
  await restoreData({ connectionConfig: config(restoreDb), filePath: snapshot, logger: null });
  assert.deepEqual(await databaseSummary(restoreDb), freshSummary);
});
