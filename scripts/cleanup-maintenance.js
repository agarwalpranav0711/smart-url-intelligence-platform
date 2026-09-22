const { pool, query } = require('../src/config/db');
const logger = require('../src/utils/logger');
const { cleanupExpiredIdempotencyKeys } = require('../src/db/idempotency');
const { purgeExpiredSessions } = require('../src/db/sessions');

const BATCH_SIZE = 5000;
const RETENTION_DAYS = 90;

/**
 * Workerless operational CLI maintenance cleanup script.
 * Deletes analytics rows older than 90 days, idempotency rows older than 24 hours, and expired sessions in bounded batches of 5000.
 */
async function runMaintenanceCleanup() {
  logger.info({ event: 'maintenance.cleanup_started', retentionDays: RETENTION_DAYS, batchSize: BATCH_SIZE });
  let totalAnalyticsDeleted = 0;
  let totalIdempotencyDeleted = 0;
  let totalSessionsDeleted = 0;

  try {
    // 1. Purge expired hourly analytics rows older than 90 days
    let analyticsBatchCount = 0;
    while (true) {
      analyticsBatchCount++;
      const sql =
        'DELETE FROM link_analytics_hourly ' +
        'WHERE ctid IN (' +
        '  SELECT ctid FROM link_analytics_hourly ' +
        '  WHERE bucket_start < NOW() - INTERVAL \'90 days\' ' +
        '  LIMIT $1' +
        ')';

      const result = await query(sql, [BATCH_SIZE]);
      const deletedInBatch = result.rowCount || 0;
      totalAnalyticsDeleted += deletedInBatch;

      logger.info({
        event: 'maintenance.analytics_batch',
        batch: analyticsBatchCount,
        deletedInBatch,
        totalAnalyticsDeleted
      });

      if (deletedInBatch < BATCH_SIZE) {
        break;
      }
    }

    // 2. Purge expired idempotency keys older than 24 hours
    let idempotencyBatchCount = 0;
    while (true) {
      idempotencyBatchCount++;
      const deletedInBatch = await cleanupExpiredIdempotencyKeys(BATCH_SIZE);
      totalIdempotencyDeleted += deletedInBatch;

      logger.info({
        event: 'maintenance.idempotency_batch',
        batch: idempotencyBatchCount,
        deletedInBatch,
        totalIdempotencyDeleted
      });

      if (deletedInBatch < BATCH_SIZE) {
        break;
      }
    }

    // 3. Purge expired or revoked web sessions
    let sessionBatchCount = 0;
    while (true) {
      sessionBatchCount++;
      const deletedInBatch = await purgeExpiredSessions(BATCH_SIZE);
      totalSessionsDeleted += deletedInBatch;

      logger.info({
        event: 'maintenance.session_batch',
        batch: sessionBatchCount,
        deletedInBatch,
        totalSessionsDeleted
      });

      if (deletedInBatch < BATCH_SIZE) {
        break;
      }
    }

    logger.info({
      event: 'maintenance.cleanup_completed',
      totalAnalyticsDeleted,
      totalIdempotencyDeleted,
      totalSessionsDeleted
    });

    return { totalAnalyticsDeleted, totalIdempotencyDeleted, totalSessionsDeleted };
  } catch (err) {
    logger.error({ event: 'maintenance.cleanup_failed', message: err.message });
    throw err;
  }
}

if (require.main === module) {
  runMaintenanceCleanup()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}

module.exports = {
  runMaintenanceCleanup,
};
