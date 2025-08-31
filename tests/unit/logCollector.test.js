/**
 * LogCollector Tests - Testing encapsulation fix
 */

const { LogCollector } = require('../../utils/logCollector');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`);
  }
}

const tests = [
  {
    name: 'getLogCount method returns correct count',
    fn: () => {
      const collector = new LogCollector(100);
      
      // The constructor logs an initialization message, so count starts at 1
      const initialCount = collector.getLogCount();
      
      // Add some logs
      collector.addCustomLog('info', 'Test message 1');
      collector.addCustomLog('warn', 'Test message 2');
      collector.addCustomLog('error', 'Test message 3');
      
      assertEqual(collector.getLogCount(), initialCount + 3, `Count should be ${initialCount + 3} after adding 3 logs`);
      
      // Clear and check again - clearLogs() also logs a "cleared" message
      collector.clearLogs();
      assertEqual(collector.getLogCount(), 1, 'Count should be 1 after clearing (clear operation logs a message)');
    }
  },
  
  {
    name: 'getLogCount works with circular buffer',
    fn: () => {
      const collector = new LogCollector(3); // Small buffer to test circular behavior
      
      // Add logs up to the limit
      collector.addCustomLog('info', 'Message 1');
      collector.addCustomLog('info', 'Message 2');
      collector.addCustomLog('info', 'Message 3');
      assertEqual(collector.getLogCount(), 3, 'Count should be 3 at buffer limit');
      
      // Add one more to trigger circular buffer behavior
      collector.addCustomLog('info', 'Message 4');
      assertEqual(collector.getLogCount(), 3, 'Count should remain 3 in circular buffer');
    }
  },

  {
    name: 'getLogCount is consistent with getLogStats total',
    fn: () => {
      const collector = new LogCollector(100);
      const initialCount = collector.getLogCount(); // Account for constructor log
      
      collector.addCustomLog('info', 'Info message 1');
      collector.addCustomLog('warn', 'Warn message 1');
      collector.addCustomLog('error', 'Error message 1');
      collector.addCustomLog('info', 'Info message 2');
      
      const count = collector.getLogCount();
      const stats = collector.getLogStats();
      
      assertEqual(count, stats.total, 'getLogCount should match getLogStats total');
      assertEqual(count, initialCount + 4, `Total count should be ${initialCount + 4}`);
    }
  }
];

async function main() {
  console.log('\n=== LogCollector Encapsulation Tests ===');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name} - PASSED`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name} - FAILED: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nLogCollector Tests Results: ${passed}/${passed + failed} passed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };