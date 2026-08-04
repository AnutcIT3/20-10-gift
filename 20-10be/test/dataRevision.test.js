const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';

const pool = require('../config/db');
const dataRevisionService = require('../services/dataRevisionService');
const dataRevisionMiddleware = require('../middleware/dataRevision');
const { isSharedDataMutation } = dataRevisionMiddleware;

test('data revision service reads and increments the shared database revision', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SELECT')) {
      return [[{ revision: '12', updated_at: '2026-08-04 12:00:00' }]];
    }
    return [{ affectedRows: 1 }];
  };
  try {
    assert.deepEqual(await dataRevisionService.getRevision(), {
      revision: 12,
      updatedAt: '2026-08-04 12:00:00',
    });
    await dataRevisionService.bumpRevision();
    assert.match(calls[1], /revision = revision \+ 1/);
  } finally {
    pool.execute = original;
  }
});

test('revision middleware tracks successful shared-data mutations only', async () => {
  const original = dataRevisionService.bumpRevision;
  let bumps = 0;
  dataRevisionService.bumpRevision = async () => { bumps += 1; };
  try {
    assert.equal(isSharedDataMutation({ method: 'PATCH', originalUrl: '/api/students/2/seat' }), true);
    assert.equal(isSharedDataMutation({ method: 'GET', originalUrl: '/api/students' }), false);
    assert.equal(isSharedDataMutation({ method: 'POST', originalUrl: '/api/auth/admin/login' }), false);
    assert.equal(isSharedDataMutation({
      method: 'POST', originalUrl: '/api/gifts/code/letters/2/react',
    }), false);

    const successResponse = new EventEmitter();
    successResponse.statusCode = 200;
    dataRevisionMiddleware(
      { method: 'DELETE', originalUrl: '/api/admin/letters/bulk' },
      successResponse,
      () => {},
    );
    successResponse.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));

    const failedResponse = new EventEmitter();
    failedResponse.statusCode = 404;
    dataRevisionMiddleware(
      { method: 'DELETE', originalUrl: '/api/letters/999' },
      failedResponse,
      () => {},
    );
    failedResponse.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bumps, 1);
  } finally {
    dataRevisionService.bumpRevision = original;
  }
});
