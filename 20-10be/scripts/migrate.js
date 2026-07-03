require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const database = process.env.DB_NAME;
  if (!database || !/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME is missing or contains invalid characters');
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true, // an toàn vì SQL files là nội bộ, đáng tin cậy
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.changeUser({ database });
    await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    const [rows] = await connection.execute('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`\u2192 ${file} (already applied)`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // multipleStatements:true cho phép chạy toàn bộ file cùng lúc
      await connection.query(sql);

      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      console.log(`\u2713 ${file}`);
    }

    console.log('All migrations completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

run();
