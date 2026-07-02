require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function run() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('Set ADMIN_PASSWORD in .env to create admin account.');
    process.exit(1);
  }

  if (!username) {
    console.error('Set ADMIN_USERNAME in .env to create admin account.');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const hash = await bcrypt.hash(password, 10);

  await connection.execute(
    'INSERT INTO admins (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [username, hash],
  );

  console.log(`Admin "${username}" created or updated.`);
  await connection.end();
}

run().catch((err) => {
  console.error('Create admin failed:', err.message);
  process.exit(1);
});
