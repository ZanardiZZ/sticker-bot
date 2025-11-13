/**
 * Unit test for MediaQueue size limits
 * Tests the fix for large queue processing errors
 */

const MediaQueue = require('../../services/mediaQueue');

const tests = [
  {
    name: 'Queue should accept jobs within size limit',
    fn: async () => {
      const queue = new MediaQueue({ 
        concurrency: 1, 
        maxQueueSize: 5 
      });
      
      const results = [];
      
      // Add 5 jobs (should all be accepted)
      for (let i = 0; i < 5; i++) {
        const promise = queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { job: i };
        });
        results.push(promise);
      }
      
      // All should complete successfully
      const completed = await Promise.all(results);
      
      if (completed.length !== 5) {
        throw new Error(`Expected 5 jobs to complete, got ${completed.length}`);
      }
      
      console.log('✅ All jobs within queue limit were accepted and processed');
    }
  },

  {
    name: 'Queue should reject jobs when full',
    fn: async () => {
      const queue = new MediaQueue({ 
        concurrency: 1, 
        maxQueueSize: 3,
        retryAttempts: 1,
        retryDelay: 10
      });
      
      const jobs = [];
      let rejectedCount = 0;
      let queueFullEventFired = false;
      
      // Listen for queueFull event
      queue.on('queueFull', () => {
        queueFullEventFired = true;
      });
      
      // Add jobs that will fill the queue (first one processes immediately, next 3 queue up)
      for (let i = 0; i < 10; i++) {
        const promise = queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return { job: i };
        }).catch(error => {
          if (error.code === 'QUEUE_FULL') {
            rejectedCount++;
            return { rejected: true };
          }
          throw error;
        });
        jobs.push(promise);
      }
      
      await Promise.all(jobs);
      
      if (rejectedCount === 0) {
        throw new Error('Expected some jobs to be rejected due to queue being full');
      }
      
      if (!queueFullEventFired) {
        throw new Error('Expected queueFull event to be emitted');
      }
      
      console.log(`✅ Queue rejected ${rejectedCount} jobs when full (correct behavior)`);
    }
  },

  {
    name: 'Queue should emit warning when usage is high',
    fn: async () => {
      const queue = new MediaQueue({ 
        concurrency: 1, 
        maxQueueSize: 10,
        retryAttempts: 1
      });
      
      let warningEmitted = false;
      
      queue.on('queueWarning', (currentSize, maxSize, usage) => {
        warningEmitted = true;
        if (usage < 0.75) {
          throw new Error(`Warning emitted too early at ${(usage * 100).toFixed(1)}% usage`);
        }
      });
      
      // Add jobs to fill queue to 80% (first processes immediately, so we need 8 more)
      const jobs = [];
      for (let i = 0; i < 9; i++) {
        jobs.push(queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return { job: i };
        }));
      }
      
      // Give time for warning to be emitted
      await new Promise(resolve => setTimeout(resolve, 10));
      
      if (!warningEmitted) {
        throw new Error('Expected queue warning to be emitted at 75%+ usage');
      }
      
      // Clean up
      await Promise.all(jobs.map(p => p.catch(() => {})));
      
      console.log('✅ Queue warning emitted when usage exceeded 75%');
    }
  },

  {
    name: 'Queue stats should include rejection count and capacity info',
    fn: async () => {
      const queue = new MediaQueue({ 
        concurrency: 1, 
        maxQueueSize: 2
      });
      
      // Try to add 5 jobs when max is 2
      const jobs = [];
      for (let i = 0; i < 5; i++) {
        jobs.push(
          queue.add(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { job: i };
          }).catch(error => {
            if (error.code === 'QUEUE_FULL') {
              return { rejected: true };
            }
            throw error;
          })
        );
      }
      
      await Promise.all(jobs);
      
      const stats = queue.getStats();
      
      if (!stats.hasOwnProperty('rejected')) {
        throw new Error('Stats should include rejected count');
      }
      
      if (!stats.hasOwnProperty('capacity')) {
        throw new Error('Stats should include capacity');
      }
      
      if (!stats.hasOwnProperty('usage')) {
        throw new Error('Stats should include usage percentage');
      }
      
      if (stats.rejected === 0) {
        throw new Error('Expected some rejected jobs in stats');
      }
      
      if (stats.capacity !== 2) {
        throw new Error(`Expected capacity of 2, got ${stats.capacity}`);
      }
      
      console.log(`✅ Queue stats correctly track rejections (${stats.rejected}) and capacity (${stats.capacity})`);
    }
  },

  {
    name: 'Queue should handle rapid job submissions gracefully',
    fn: async () => {
      const queue = new MediaQueue({ 
        concurrency: 2, 
        maxQueueSize: 10
      });
      
      let accepted = 0;
      let rejected = 0;
      
      // Rapidly submit 30 jobs
      const jobs = [];
      for (let i = 0; i < 30; i++) {
        const promise = queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { job: i };
        }).then(result => {
          accepted++;
          return result;
        }).catch(error => {
          if (error.code === 'QUEUE_FULL') {
            rejected++;
            return { rejected: true };
          }
          throw error;
        });
        jobs.push(promise);
      }
      
      await Promise.all(jobs);
      
      if (accepted + rejected !== 30) {
        throw new Error(`Expected 30 total jobs, got ${accepted + rejected}`);
      }
      
      if (rejected === 0) {
        throw new Error('Expected some jobs to be rejected with rapid submissions');
      }
      
      console.log(`✅ Rapid submissions handled: ${accepted} accepted, ${rejected} rejected`);
    }
  },

  {
    name: 'Queue error should have QUEUE_FULL code for easy detection',
    fn: async () => {
      const queue = new MediaQueue({ 
        concurrency: 1, 
        maxQueueSize: 1
      });
      
      // Fill the queue with a slow job
      const job1 = queue.add(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { job: 1 };
      });
      
      // Wait a bit to ensure first job is processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Try to add more jobs to trigger rejection
      let errorCaught = false;
      let errorCode = null;
      
      const rejectionPromises = [];
      
      // Add multiple jobs rapidly to fill queue
      for (let i = 0; i < 5; i++) {
        rejectionPromises.push(
          queue.add(async () => ({ job: i + 2 })).catch(error => {
            errorCaught = true;
            errorCode = error.code;
            return { rejected: true };
          })
        );
      }
      
      await Promise.all(rejectionPromises);
      await job1;
      
      if (!errorCaught) {
        throw new Error('Expected queue overflow error to be thrown');
      }
      
      if (errorCode !== 'QUEUE_FULL') {
        throw new Error(`Expected error code 'QUEUE_FULL', got '${errorCode}'`);
      }
      
      console.log('✅ Queue overflow error has correct QUEUE_FULL code');
    }
  }
];

// Helper function to run tests
async function runTests() {
  console.log('🧪 Testing MediaQueue size limit functionality...\n');
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    try {
      console.log(`📋 ${test.name}`);
      await test.fn();
      passed++;
      console.log('✅ PASSED\n');
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      console.error(error.stack);
    }
  }
  
  console.log('============================================================');
  if (passed === total) {
    console.log('🎉 All queue size limit tests passed!');
    console.log('\n📋 Summary of enhancements:');
    console.log('  ✅ Queue respects maximum size limit');
    console.log('  ✅ Jobs are rejected with QUEUE_FULL error when full');
    console.log('  ✅ Queue emits warning when usage exceeds 75%');
    console.log('  ✅ Queue emits queueFull event for monitoring');
    console.log('  ✅ Stats include rejection count and capacity info');
    console.log('  ✅ Rapid submissions handled gracefully');
    console.log('\n🔧 This fixes the large queue processing errors issue!');
  } else {
    console.log(`❌ ${total - passed} out of ${total} tests failed`);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { tests };
