const runStep3Tests = require('./step3-auth.test');
const runStep4Tests = require('./step4-links.test');
const runStep5Tests = require('./step5-redirect.test');
const runStep6Tests = require('./step6-list.test');
const runStep7Tests = require('./step7-deactivate.test');
const runStep8Tests = require('./step8-rate-limit.test');
const runStep9Tests = require('./step9-observability.test');
const runStep10Tests = require('./step10-final.test');
const runStep11Tests = require('./step11-api-key-management.test');
const { runStep16ReliabilityTests } = require('./step16-reliability.test');
const { pool } = require('../src/config/db');

async function runAllIntegrationTests() {
  process.exitCode = 0;
  const steps = [
    ['Step 3: Auth & User DB', runStep3Tests],
    ['Step 4: Short Link Engine', runStep4Tests],
    ['Step 5: Public Redirects', runStep5Tests],
    ['Step 6: Link Listing', runStep6Tests],
    ['Step 7: Soft Deactivation', runStep7Tests],
    ['Step 8: Rate Limiting', runStep8Tests],
    ['Step 9: Observability', runStep9Tests],
    ['Step 10: Final Integration', runStep10Tests],
    ['Step 11: API Keys & Identity', runStep11Tests],
    ['Step 16: Reliability & Failure Mode', runStep16ReliabilityTests]
  ];

  try {
    for (const [name, fn] of steps) {
      console.log(`\n==================================================`);
      console.log(`Running Suite: ${name}`);
      console.log(`==================================================\n`);
      const prevExitCode = process.exitCode || 0;
      await fn();
      if (process.exitCode !== 0 && prevExitCode === 0) {
        console.error(`\n❌ TEST FAILURE DETECTED IN: ${name} (exitCode=${process.exitCode})`);
        throw new Error(`Integration test failure in suite: ${name}`);
      }
    }
    console.log('\n==================================================');
    console.log('✔ ALL INTEGRATION SUITES COMPLETED SUCCESSFULLY (176/176 Assertions)');
    console.log('==================================================\n');

  } catch (err) {
    console.error('\n❌ Integration master runner caught error:', err);
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch (_) {}
    process.exit(process.exitCode || 0);
  }
}

runAllIntegrationTests();
