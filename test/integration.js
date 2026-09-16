const runStep3Tests = require('./step3-auth.test');
const runStep4Tests = require('./step4-links.test');
const runStep5Tests = require('./step5-redirect.test');
const runStep6Tests = require('./step6-list.test');
const runStep7Tests = require('./step7-deactivate.test');
const runStep8Tests = require('./step8-rate-limit.test');
const runStep9Tests = require('./step9-observability.test');
const runStep10Tests = require('./step10-final.test');
const { pool } = require('../src/config/db');

async function runAllIntegrationTests() {
  try {
    await runStep3Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep4Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep5Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep6Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep7Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep8Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep9Tests();
    console.log('\n--------------------------------------------------\n');
    await runStep10Tests();
  } catch (err) {
    console.error('Integration suite failure:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runAllIntegrationTests();

