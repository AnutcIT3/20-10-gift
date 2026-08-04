const pool = require('../config/db');

async function getRevision() {
  const [[row]] = await pool.execute(
    'SELECT revision, updated_at FROM app_data_revision WHERE id = 1',
  );
  return {
    revision: Number(row?.revision || 0),
    updatedAt: row?.updated_at || null,
  };
}

async function bumpRevision() {
  await pool.execute(
    'UPDATE app_data_revision SET revision = revision + 1 WHERE id = 1',
  );
}

module.exports = { getRevision, bumpRevision };
