const { query, pool } = require('../config/db');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Initializes the PostgreSQL idempotency_keys table and indexes idempotently.
 */
async function initializeIdempotencySchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS idempotency_keys (
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        idempotency_key VARCHAR(64) NOT NULL,
        request_hash CHAR(64) NOT NULL,
        response_status INT NOT NULL,
        response_body JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (user_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
    ON idempotency_keys (expires_at);
  `;
  await query(sql);
}

/**
 * Executes an atomic single-transaction idempotency key reservation and link creation mutation.
 *
 * Steps inside single transaction:
 * 1. BEGIN transaction.
 * 2. Attempt reservation INSERT into idempotency_keys with temporary JSONB placeholder '{}'.
 * 3. If INSERT returns 1 row (winner):
 *    a. Execute link insertion inside SAME transaction client.
 *    b. Construct 201 response body.
 *    c. UPDATE idempotency_keys row with actual response body JSON.
 *    d. COMMIT transaction.
 *    e. Return { replayed: false, status: 201, body: responseBody }.
 * 4. If INSERT returns 0 rows (ON CONFLICT DO NOTHING - key exists):
 *    a. Query existing idempotency_keys record for (user_id, idempotency_key).
 *    b. COMMIT transaction.
 *    c. If request_hash matches: return { replayed: true, status: existing.response_status, body: existing.response_body }.
 *    d. If request_hash differs: return { replayed: false, conflict: true }.
 * 5. On any transaction error: ROLLBACK (undoes both reservation and link creation), release client, throw error.
 */
async function executeIdempotentLinkCreation({ userId, idempotencyKey, requestHash, createFn }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Attempt reservation insert inside transaction using temporary JSONB placeholder '{}'
    const reserveSql = `
      INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash, response_status, response_body, expires_at)
      VALUES ($1, $2, $3, 201, '{}'::jsonb, NOW() + INTERVAL '24 hours')
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING user_id
    `;
    const reserveRes = await client.query(reserveSql, [userId, idempotencyKey, requestHash]);

    if (reserveRes.rows.length === 1) {
      // CASE 1: This transaction won reservation! Execute link creation inside SAME client transaction
      const link = await createFn(client);
      const responseBody = {
        short_code: link.short_code,
        target_url: link.target_url,
        user_id: link.user_id,
        click_count: parseInt(link.click_count, 10) || 0,
        is_active: link.is_active,
        created_at: link.created_at,
        expires_at: link.expires_at || null,
        routing_config: link.routing_config || null
      };

      const updateSql = `
        UPDATE idempotency_keys
        SET response_body = $1
        WHERE user_id = $2 AND idempotency_key = $3
      `;
      await client.query(updateSql, [JSON.stringify(responseBody), userId, idempotencyKey]);

      await client.query('COMMIT');
      return { replayed: false, status: 201, body: responseBody };
    } else {
      // CASE 2: CONFLICT! Key already exists (claimed by another committed transaction)
      const lookupSql = `
        SELECT request_hash, response_status, response_body
        FROM idempotency_keys
        WHERE user_id = $1 AND idempotency_key = $2
      `;
      const lookupRes = await client.query(lookupSql, [userId, idempotencyKey]);
      await client.query('COMMIT');

      const existingRecord = lookupRes.rows[0];
      if (existingRecord && existingRecord.request_hash === requestHash) {
        incrementMetric('idempotency_hits_total');
        return {
          replayed: true,
          status: existingRecord.response_status,
          body: existingRecord.response_body
        };
      } else {
        incrementMetric('idempotency_conflicts_total');
        return { replayed: false, conflict: true };
      }
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore secondary rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Purges expired idempotency keys (older than 24 hours).
 */
async function cleanupExpiredIdempotencyKeys(batchSize = 5000) {
  const sql = `
    DELETE FROM idempotency_keys
    WHERE ctid IN (
      SELECT ctid FROM idempotency_keys
      WHERE expires_at < NOW()
      LIMIT $1
    )
  `;
  const res = await query(sql, [batchSize]);
  return res.rowCount || 0;
}

module.exports = {
  initializeIdempotencySchema,
  executeIdempotentLinkCreation,
  cleanupExpiredIdempotencyKeys,
};
