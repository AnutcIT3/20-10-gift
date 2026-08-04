const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';

const { shutdownServer } = require('../server');

test('shutdown closes HTTP traffic before ending the database pool', async () => {
  const calls = [];
  const server = {
    close(callback) { calls.push('server.close'); callback(); },
    closeIdleConnections() { calls.push('server.closeIdleConnections'); },
  };
  const pool = {
    async end() { calls.push('pool.end'); },
  };

  await shutdownServer(server, { pool, timeoutMs: 100, logger: null });
  assert.equal(calls[0], 'server.close');
  assert.ok(calls.includes('server.closeIdleConnections'));
  assert.equal(calls.at(-1), 'pool.end');
});
