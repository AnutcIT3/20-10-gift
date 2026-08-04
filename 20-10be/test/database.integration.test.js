const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { checksum, run } = require('../scripts/migrate');
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

test('migration checksums ignore platform line endings', () => {
  assert.equal(checksum('SELECT 1;\nSELECT 2;\n'), checksum('SELECT 1;\r\nSELECT 2;\r\n'));
});

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
  const compensateDb = `gift_test_compensate_${suffix}`;
  const databases = [freshDb, upgradeDb, restoreDb, compensateDb];
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

  const preCompensationFiles = fs.readdirSync(migrationsDir)
    .filter((file) => /^\d+.*\.sql$/.test(file) && !/^01[34]_/.test(file))
    .sort();
  await run({ env, database: compensateDb, files: preCompensationFiles, logger: null });
  const compensate = await mysql.createConnection(config(compensateDb));
  const [[keeper]] = await compensate.execute(
    "SELECT id FROM students WHERE normalized_name = 'hung' AND is_active = TRUE LIMIT 1",
  );
  const [duplicateResult] = await compensate.execute(
    `INSERT INTO students (full_name, normalized_name, access_code, class_name, is_active)
     VALUES ('Hùng', 'hung', 'migration-test-hung', '12A1', FALSE)`,
  );
  const duplicateId = duplicateResult.insertId;
  await compensate.execute(
    "INSERT INTO gallery (student_id, image_url) VALUES (?, 'https://example.test/hung.jpg')",
    [duplicateId],
  );
  await compensate.execute(
    "INSERT INTO letters (student_id, content) VALUES (?, 'Migration test')",
    [duplicateId],
  );
  await compensate.execute(
    "INSERT INTO music (student_id, file_url) VALUES (?, 'https://example.test/hung.mp3')",
    [duplicateId],
  );
  await compensate.execute(
    "INSERT INTO videos (student_id, video_url) VALUES (?, 'https://example.test/hung.mp4')",
    [duplicateId],
  );
  await compensate.end();

  await run({ env, database: compensateDb, logger: null });
  const compensated = await mysql.createConnection(config(compensateDb));
  const [[activeHung]] = await compensated.execute(
    "SELECT COUNT(*) AS count FROM students WHERE normalized_name = 'hung' AND is_active = TRUE",
  );
  const [[duplicateHung]] = await compensated.execute(
    'SELECT is_active FROM students WHERE id = ?',
    [duplicateId],
  );
  const [assetOwners] = await compensated.query(
    `SELECT student_id FROM gallery WHERE image_url = 'https://example.test/hung.jpg'
     UNION ALL SELECT student_id FROM letters WHERE content = 'Migration test'
     UNION ALL SELECT student_id FROM music WHERE file_url = 'https://example.test/hung.mp3'
     UNION ALL SELECT student_id FROM videos WHERE video_url = 'https://example.test/hung.mp4'`,
  );
  await compensated.end();
  assert.equal(Number(activeHung.count), 1);
  assert.equal(Number(duplicateHung.is_active), 0);
  assert.deepEqual(assetOwners.map((row) => Number(row.student_id)), [
    Number(keeper.id), Number(keeper.id), Number(keeper.id), Number(keeper.id),
  ]);

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
  const restored = await mysql.createConnection(config(restoreDb));
  const [[revision]] = await restored.execute('SELECT revision FROM app_data_revision WHERE id = 1');
  await restored.end();
  assert.equal(Number(revision.revision), 1);
});
