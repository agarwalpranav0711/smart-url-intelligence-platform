/**
 * Scalability & Query Performance Audit Script (Step 17)
 * Populates a controlled test dataset (50,000 links across users)
 * and executes EXPLAIN ANALYZE on core system queries.
 */
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/url_shortener';
const pool = new Pool({ connectionString });

function generateBase62Code(length = 6) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

async function runScalabilityBenchmark() {
  console.log('==================================================');
  console.log('STEP 17: API & DATABASE SCALABILITY BENCHMARK');
  console.log('==================================================\n');

  const client = await pool.connect();

  try {
    // 1. Provision Benchmark Developer User & 50,000 Links
    console.log('[1/4] Populating controlled benchmark dataset (50,000 links)...');
    
    // Create benchmark user
    const userRes = await client.query(`INSERT INTO users DEFAULT VALUES RETURNING user_id`);
    const benchmarkUserId = userRes.rows[0].user_id;

    // Create benchmark API key
    const rawKey = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    await client.query(`INSERT INTO api_keys (user_id, api_key_hash, name) VALUES ($1, $2, $3)`, [benchmarkUserId, keyHash, 'Benchmark Key']);

    // Batch insert 50,000 links in batches of 5,000
    const TOTAL_LINKS = 50000;
    const BATCH_SIZE = 5000;
    const createdCodes = [];

    const startTime = Date.now();
    for (let i = 0; i < TOTAL_LINKS; i += BATCH_SIZE) {
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (let j = 0; j < BATCH_SIZE; j++) {
        const code = generateBase62Code(6);
        createdCodes.push(code);
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2})`);
        params.push(code, `https://example.com/target-${i + j}`, benchmarkUserId);
        paramIdx += 3;
      }

      await client.query(`INSERT INTO links (short_code, target_url, user_id) VALUES ${values.join(', ')}`, params);
    }
    const duration = Date.now() - startTime;
    console.log(`Successfully populated ${TOTAL_LINKS} links in ${duration} ms.\n`);

    // 2. Execute EXPLAIN ANALYZE on Core System Queries
    console.log('[2/4] Running EXPLAIN ANALYZE on core database queries...\n');

    // Query 1: Redirect lookup by short_code
    const testCode = createdCodes[0];
    const q1Explain = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT short_code, target_url, user_id, click_count, is_active, created_at FROM links WHERE short_code = $1`, [testCode]);
    console.log('--- Query 1: Redirect Lookup (SELECT short_code) ---');
    console.log(`Execution Time: ${q1Explain.rows[0]['QUERY PLAN'][0]['Execution Time']} ms`);
    console.log(`Planning Time: ${q1Explain.rows[0]['QUERY PLAN'][0]['Planning Time']} ms`);
    console.log(`Node Type: ${q1Explain.rows[0]['QUERY PLAN'][0]['Plan']['Node Type']} using ${q1Explain.rows[0]['QUERY PLAN'][0]['Plan']['Index Name']}\n`);

    // Query 2: API Key Authentication lookup by hash
    const q2Explain = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT key_id, user_id, name, created_at, revoked_at FROM api_keys WHERE api_key_hash = $1`, [keyHash]);
    console.log('--- Query 2: API Key Auth Lookup (SELECT api_key_hash) ---');
    console.log(`Execution Time: ${q2Explain.rows[0]['QUERY PLAN'][0]['Execution Time']} ms`);
    console.log(`Planning Time: ${q2Explain.rows[0]['QUERY PLAN'][0]['Planning Time']} ms`);
    console.log(`Node Type: ${q2Explain.rows[0]['QUERY PLAN'][0]['Plan']['Node Type']} using ${q2Explain.rows[0]['QUERY PLAN'][0]['Plan']['Index Name']}\n`);

    // Query 3: Atomic Click Count Update
    const q3Explain = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) UPDATE links SET click_count = click_count + 1 WHERE short_code = $1 AND is_active = true`, [testCode]);
    console.log('--- Query 3: Atomic Click Count Update (UPDATE links) ---');
    console.log(`Execution Time: ${q3Explain.rows[0]['QUERY PLAN'][0]['Execution Time']} ms`);
    console.log(`Planning Time: ${q3Explain.rows[0]['QUERY PLAN'][0]['Planning Time']} ms`);
    console.log(`Node Type: ${q3Explain.rows[0]['QUERY PLAN'][0]['Plan']['Node Type']} using ${q3Explain.rows[0]['QUERY PLAN'][0]['Plan']['Index Name']}\n`);

    // 3. Phase 4: Pagination Scalability Audit across offsets
    console.log('[3/4] Benchmarking LIMIT/OFFSET Pagination Scalability on 50,000 links...\n');
    const offsets = [0, 100, 1000, 10000, 40000];

    for (const offset of offsets) {
      const pExplain = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT short_code, target_url, click_count, is_active, created_at FROM links WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [benchmarkUserId, 20, offset]
      );
      const plan = pExplain.rows[0]['QUERY PLAN'][0];
      console.log(`OFFSET ${offset.toString().padStart(5, ' ')}: Execution Time = ${plan['Execution Time']} ms | Node: ${plan['Plan']['Node Type']} | Shared Hit Blocks: ${plan['Plan']['Shared Hit Blocks'] || 0}`);
    }

    // 4. Clean up benchmark test data
    console.log('\n[4/4] Cleaning up benchmark test user and 50,000 links...');
    await client.query(`DELETE FROM users WHERE user_id = $1`, [benchmarkUserId]);
    console.log('Benchmark dataset cleaned up successfully.\n');

  } catch (err) {
    console.error('Benchmark error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runScalabilityBenchmark();
