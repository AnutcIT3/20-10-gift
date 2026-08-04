require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function checksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function databaseConfig(env, database) {
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4',
    ...(database ? { database } : {}),
  };
}

async function ensureChecksumColumn(connection, database) {
  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'schema_migrations' AND COLUMN_NAME = 'checksum'`,
    [database],
  );
  if (!columns.length) {
    await connection.query('ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL');
  }
}

async function run(options = {}) {
  const env = options.env || process.env;
  const database = options.database || env.DB_NAME;
  const logger = options.logger === undefined ? console : options.logger;
  if (!database || !/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME is missing or contains invalid characters');
  }
  if (!env.DB_HOST || !env.DB_USER) {
    throw new Error('DB_HOST and DB_USER are required');
  }
  const connection = await mysql.createConnection(databaseConfig(env));

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.changeUser({ database });
    await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await ensureChecksumColumn(connection, database);

    const [rows] = await connection.execute('SELECT filename, checksum FROM schema_migrations');
    const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

    const migrationsDir = options.migrationsDir || path.join(__dirname, '..', 'migrations');
    const availableFiles = fs.readdirSync(migrationsDir)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    const files = options.files || availableFiles;
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const fileChecksum = checksum(sql);

      if (applied.has(file)) {
        const storedChecksum = applied.get(file);
        if (storedChecksum && storedChecksum !== fileChecksum) {
          throw new Error(`Migration checksum mismatch: ${file}`);
        }
        if (!storedChecksum) {
          await connection.execute(
            'UPDATE schema_migrations SET checksum = ? WHERE filename = ?',
            [fileChecksum, file],
          );
        }
        logger?.log(`\u2192 ${file} (already applied)`);
        continue;
      }

      await connection.query(sql);

      await connection.execute(
        'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
        [file, fileChecksum],
      );
      logger?.log(`\u2713 ${file}`);
    }

    logger?.log('All migrations completed.');
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { checksum, databaseConfig, run };
