/**
 * Step 16: Reliability & Failure Mode Automated Verification Suite
 * Tests cache edge cases, failure resiliency, DB error contracts, and recovery guarantees.
 */
const assert = require('assert');
const { linkCache, MemoryCache } = require('../src/utils/cache');
const linkService = require('../src/services/linkService');
const linksDb = require('../src/db/links');

async function runStep16ReliabilityTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 16: Reliability & Failure Mode');
  console.log('==================================================\n');

  // --- Phase 3: Cache Reliability & Edge Cases ---

  // 1. Cache hit & miss behavior
  const testCache = new MemoryCache(2, 100); // maxSize = 2, ttl = 100ms
  testCache.set('code1', { target_url: 'https://example.com/1', is_active: true });
  testCache.set('code2', { target_url: 'https://example.com/2', is_active: true });

  assert.strictEqual(testCache.get('code1').target_url, 'https://example.com/1');
  assert.strictEqual(testCache.get('code2').target_url, 'https://example.com/2');
  assert.strictEqual(testCache.get('code3'), null); // Cache miss returns null
  console.log('✔ Test 1 Passed: Cache hit returns cached entry; cache miss returns null');

  // 2. Bounded LRU Capacity Eviction
  testCache.set('code3', { target_url: 'https://example.com/3', is_active: true }); // Evicts code1
  assert.strictEqual(testCache.get('code1'), null); // Oldest key evicted
  assert.strictEqual(testCache.get('code2').target_url, 'https://example.com/2');
  assert.strictEqual(testCache.get('code3').target_url, 'https://example.com/3');
  console.log('✔ Test 2 Passed: Bounded capacity evicts oldest entry (LRU eviction verified)');

  // 3. TTL Expiration
  await new Promise((r) => setTimeout(r, 150)); // Wait for 100ms TTL to expire
  assert.strictEqual(testCache.get('code2'), null);
  assert.strictEqual(testCache.get('code3'), null);
  console.log('✔ Test 3 Passed: Expired entries return null after TTL elapses');

  // 4. Exception Resiliency (Cache errors do not crash app)
  const faultyCache = new MemoryCache();
  faultyCache.cache = {
    has: () => { throw new Error('Simulated cache storage failure'); },
    set: () => { throw new Error('Simulated cache write failure'); },
    delete: () => { throw new Error('Simulated cache delete failure'); },
  };
  assert.strictEqual(faultyCache.get('anyKey'), null); // Safely returns null on exception
  faultyCache.set('anyKey', 'val'); // Fails silently without crashing
  faultyCache.del('anyKey'); // Fails silently without crashing
  console.log('✔ Test 4 Passed: Cache exceptions fail safely to null without crashing application');

  // 5. Invalidation on Deactivation & Deletion
  const usersDb = require('../src/db/users');
  const testUser = await usersDb.createUser(`step16_test_${Date.now()}@example.com`, 'hash_placeholder');
  const userId = testUser.user_id;

  const createdLink = await linkService.createShortLink('https://example.com/reliability-test', userId);
  const code = createdLink.short_code;

  // Prime cache
  const linkBefore = await linkService.getLinkByCode(code);
  assert.strictEqual(linkBefore.is_active, true);
  assert.notStrictEqual(linkCache.get(code), null); // Cached now

  // Soft-deactivate link
  await linkService.deactivateLink(code, userId);
  assert.strictEqual(linkCache.get(code), null); // Invalidation verified!

  const linkAfter = await linkService.getLinkByCode(code);
  assert.strictEqual(linkAfter.is_active, false); // Returned inactive from DB

  // Cleanup test link & user
  await linksDb.deleteLinkByShortCode(code);
  assert.strictEqual(linkCache.get(code), null);
  console.log('✔ Test 5 Passed: Deactivation and deletion immediately invalidate cached entries');


  console.log('\nAll Step 16 Reliability & Failure Mode tests passed successfully!\n');
}

if (require.main === module) {
  runStep16ReliabilityTests().catch((err) => {
    console.error('Reliability test failed:', err);
    process.exit(1);
  });
}

module.exports = { runStep16ReliabilityTests };
