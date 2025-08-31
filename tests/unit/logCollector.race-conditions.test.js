/**
 * LogCollector Race Condition Tests - Testing console interception synchronization
 */

const { LogCollector, getLogCollector } = require('../../utils/logCollector');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const tests = [
  {
    name: 'Multiple instances should not interfere with each other',
    fn: () => {
      // Create first instance
      const collector1 = new LogCollector(100);
      const initialCount1 = collector1.getLogCount();
      
      // Verify first instance is intercepting
      assertEqual(LogCollector._isConsoleIntercepted, true, 'Console should be intercepted by first instance');
      assertEqual(LogCollector._activeInstance, collector1, 'First instance should be active');
      assertEqual(collector1.isIntercepting, true, 'First instance should be intercepting');
      
      // Create second instance (should not intercept)
      const collector2 = new LogCollector(100);
      const initialCount2 = collector2.getLogCount();
      
      // Verify second instance is not intercepting
      assertEqual(LogCollector._activeInstance, collector1, 'First instance should still be active');
      assertEqual(collector2.isIntercepting, false, 'Second instance should not be intercepting');
      
      // Test logging - only first instance should capture console logs
      console.log('Test message for race condition');
      
      // First instance should capture the log
      assert(collector1.getLogCount() > initialCount1, 'First instance should capture console logs');
      // Second instance should not capture console logs (only its constructor log)
      assertEqual(collector2.getLogCount(), initialCount2, 'Second instance should not capture console logs');
      
      // Cleanup
      collector1.restore();
    }
  },
  
  {
    name: 'Restoring from wrong instance should not affect active interceptor',
    fn: () => {
      const collector1 = new LogCollector(100);
      const collector2 = new LogCollector(100);
      
      // collector1 is the active interceptor
      assertEqual(LogCollector._activeInstance, collector1, 'First instance should be active');
      
      // Try to restore from collector2 (should fail gracefully)
      collector2.restore();
      
      // Verify collector1 is still active
      assertEqual(LogCollector._isConsoleIntercepted, true, 'Console should still be intercepted');
      assertEqual(LogCollector._activeInstance, collector1, 'First instance should still be active');
      
      // Cleanup with correct instance
      collector1.restore();
      assertEqual(LogCollector._isConsoleIntercepted, false, 'Console should not be intercepted after restore');
    }
  },
  
  {
    name: 'Sequential instance creation should work correctly',
    fn: () => {
      // Create and restore first instance
      const collector1 = new LogCollector(100);
      assertEqual(LogCollector._activeInstance, collector1, 'First instance should be active');
      collector1.restore();
      assertEqual(LogCollector._isConsoleIntercepted, false, 'Console should not be intercepted after restore');
      
      // Create second instance after first is restored
      const collector2 = new LogCollector(100);
      assertEqual(LogCollector._activeInstance, collector2, 'Second instance should be active');
      assertEqual(collector2.isIntercepting, true, 'Second instance should be intercepting');
      
      // Test that second instance captures logs
      const initialCount = collector2.getLogCount();
      console.log('Test message for second instance');
      assert(collector2.getLogCount() > initialCount, 'Second instance should capture console logs');
      
      // Cleanup
      collector2.restore();
    }
  },
  
  {
    name: 'Singleton pattern should prevent multiple active instances',
    fn: () => {
      // Clear any existing singleton instance for clean test
      const utils = require('../../utils/logCollector');
      
      const singleton1 = getLogCollector(100);
      const singleton2 = getLogCollector(100);
      
      // Both should return the same instance
      assertEqual(singleton1, singleton2, 'Singleton should return the same instance');
      assertEqual(singleton1.isIntercepting, true, 'Singleton instance should be intercepting');
      
      // Cleanup
      singleton1.restore();
    }
  },
  
  {
    name: 'Direct instantiation after singleton should not interfere',
    fn: () => {
      const singleton = getLogCollector(100);
      assertEqual(singleton.isIntercepting, true, 'Singleton should be intercepting');
      
      // Try to create direct instance (should not interfere)
      const directInstance = new LogCollector(100);
      assertEqual(directInstance.isIntercepting, false, 'Direct instance should not be intercepting');
      assertEqual(LogCollector._activeInstance, singleton, 'Singleton should still be active');
      
      // Cleanup
      singleton.restore();
    }
  },
  
  {
    name: 'Console methods should work correctly after multiple create/restore cycles',
    fn: () => {
      // Store original console methods to verify they're properly restored
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      const originalInfo = console.info;
      
      // Cycle 1
      const collector1 = new LogCollector(100);
      collector1.restore();
      
      // Cycle 2
      const collector2 = new LogCollector(100);
      collector2.restore();
      
      // Verify console methods are the original ones
      assertEqual(console.log, originalLog, 'console.log should be restored to original');
      assertEqual(console.warn, originalWarn, 'console.warn should be restored to original');
      assertEqual(console.error, originalError, 'console.error should be restored to original');
      assertEqual(console.info, originalInfo, 'console.info should be restored to original');
      
      // Verify static state is clean
      assertEqual(LogCollector._isConsoleIntercepted, false, 'Console should not be intercepted');
      assertEqual(LogCollector._activeInstance, null, 'No instance should be active');
    }
  }
];

async function main() {
  console.log('\n=== LogCollector Race Condition Tests ===');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      // Reset static state and singleton before each test
      LogCollector._isConsoleIntercepted = false;
      LogCollector._activeInstance = null;
      // Note: We can't easily reset the singleton instance from outside the module
      // but the updated getLogCollector should handle it properly
      
      await test.fn();
      console.log(`✅ ${test.name} - PASSED`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name} - FAILED: ${error.message}`);
      failed++;
    }
  }
  
  // Final cleanup to ensure clean state
  LogCollector._isConsoleIntercepted = false;
  LogCollector._activeInstance = null;
  
  console.log(`\nRace Condition Tests Results: ${passed}/${passed + failed} passed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };