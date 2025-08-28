#!/usr/bin/env node
/**
 * Unit tests for MediaQueue service
 */

const path = require('path');
const { assert, assertEqual, assertLength, runTestSuite, sleep } = require('../helpers/testUtils');

// Mock MediaQueue for testing
class TestMediaQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 3;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 100; // Shorter delay for testing
    
    this.queue = [];
    this.processing = new Set();
    this.stats = {
      processed: 0,
      failed: 0,
      queued: 0
    };
    this.events = [];
  }

  emit(event, ...args) {
    this.events.push({ event, args, timestamp: Date.now() });
  }

  async add(job) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        job,
        resolve,
        reject,
        attempts: 0,
        addedAt: Date.now()
      };
      
      this.queue.push(queueItem);
      this.stats.queued++;
      this.emit('jobAdded', queueItem.id);
      
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    this.processing.add(item.id);
    this.stats.queued--;
    
    this.emit('jobStarted', item.id);

    try {
      const result = await this.executeJob(item);
      this.processing.delete(item.id);
      this.stats.processed++;
      this.emit('jobCompleted', item.id, result);
      item.resolve(result);
    } catch (error) {
      this.processing.delete(item.id);
      item.attempts++;

      if (item.attempts < this.retryAttempts) {
        // Retry with exponential backoff
        const delay = this.retryDelay * Math.pow(2, item.attempts - 1);
        setTimeout(() => {
          this.queue.unshift(item); // Add back to front of queue
          this.stats.queued++;
          this.processNext();
        }, delay);
        this.emit('jobRetry', item.id, item.attempts, delay);
      } else {
        this.stats.failed++;
        this.emit('jobFailed', item.id, error);
        item.reject(error);
      }
    }

    // Process next job
    setImmediate(() => this.processNext());
  }

  async executeJob(item) {
    if (typeof item.job === 'function') {
      return await item.job();
    } else if (item.job && typeof item.job.execute === 'function') {
      return await item.job.execute();
    } else {
      throw new Error('Invalid job format');
    }
  }

  getStats() {
    return {
      ...this.stats,
      processing: this.processing.size,
      queued: this.queue.length
    };
  }

  clear() {
    // Reject all queued items
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    
    // Reject all processing items (we can't stop them, but we can reject their promises)
    const processingItems = [...this.processing];
    processingItems.forEach(id => {
      // Note: In a real implementation, we'd need to track the promises of processing items
      // For this test, we'll just mark them as failed in stats
      this.processing.delete(id);
      this.stats.failed++;
    });
    
    this.queue = [];
    this.stats = {
      processed: 0,
      failed: 0,
      queued: 0
    };
    this.events = [];
  }

  getEvents() {
    return [...this.events];
  }

  async waitForIdle() {
    while (this.processing.size > 0 || this.queue.length > 0) {
      await sleep(10);
    }
  }
}

const tests = [
  {
    name: 'Basic job execution',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1 });
      
      const testJob = async () => {
        await sleep(50);
        return { success: true, data: 'test result' };
      };
      
      const result = await queue.add(testJob);
      
      assert(result.success === true, 'Job should succeed');
      assertEqual(result.data, 'test result', 'Result data should match');
      
      const stats = queue.getStats();
      assertEqual(stats.processed, 1, 'Should have processed 1 job');
      assertEqual(stats.failed, 0, 'Should have 0 failed jobs');
    }
  },

  {
    name: 'Multiple concurrent jobs',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 3 });
      const results = [];
      
      // Add multiple jobs
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const job = async () => {
          await sleep(50);
          return { jobId: i, timestamp: Date.now() };
        };
        promises.push(queue.add(job));
      }
      
      const allResults = await Promise.all(promises);
      
      assertLength(allResults, 5, 'Should complete all 5 jobs');
      allResults.forEach((result, index) => {
        assertEqual(result.jobId, index, `Job ${index} should have correct ID`);
        assert(typeof result.timestamp === 'number', 'Should have timestamp');
      });
      
      const stats = queue.getStats();
      assertEqual(stats.processed, 5, 'Should have processed 5 jobs');
      assertEqual(stats.failed, 0, 'Should have 0 failed jobs');
    }
  },

  {
    name: 'Concurrency limit enforcement',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 2 });
      const executionTimes = [];
      
      // Add 4 jobs that record when they start
      const promises = [];
      for (let i = 0; i < 4; i++) {
        const job = async () => {
          const startTime = Date.now();
          executionTimes.push({ jobId: i, startTime });
          await sleep(100); // Longer duration to test concurrency
          return { jobId: i };
        };
        promises.push(queue.add(job));
      }
      
      await Promise.all(promises);
      
      // Sort by start time to analyze concurrency
      executionTimes.sort((a, b) => a.startTime - b.startTime);
      
      // First two jobs should start roughly at the same time
      const timeDiff1 = executionTimes[1].startTime - executionTimes[0].startTime;
      assert(timeDiff1 < 50, 'First two jobs should start concurrently');
      
      // Third job should start after first batch completes
      const timeDiff2 = executionTimes[2].startTime - executionTimes[0].startTime;
      assert(timeDiff2 >= 90, 'Third job should wait for first batch');
      
      const stats = queue.getStats();
      assertEqual(stats.processed, 4, 'Should have processed 4 jobs');
    }
  },

  {
    name: 'Job retry mechanism',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1, retryAttempts: 3, retryDelay: 20 });
      let attemptCount = 0;
      
      const flakeyJob = async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return { success: true, attempts: attemptCount };
      };
      
      const result = await queue.add(flakeyJob);
      
      assert(result.success === true, 'Job should eventually succeed');
      assertEqual(result.attempts, 3, 'Should have made 3 attempts');
      
      const stats = queue.getStats();
      assertEqual(stats.processed, 1, 'Should have processed 1 job');
      assertEqual(stats.failed, 0, 'Should have 0 failed jobs');
      
      // Check retry events
      const events = queue.getEvents();
      const retryEvents = events.filter(e => e.event === 'jobRetry');
      assertEqual(retryEvents.length, 2, 'Should have 2 retry events');
    }
  },

  {
    name: 'Job failure after max retries',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1, retryAttempts: 2, retryDelay: 20 });
      
      const alwaysFailJob = async () => {
        throw new Error('Always fails');
      };
      
      let errorThrown = false;
      try {
        await queue.add(alwaysFailJob);
      } catch (error) {
        errorThrown = true;
        assertEqual(error.message, 'Always fails', 'Should propagate original error');
      }
      
      assert(errorThrown, 'Should throw error after max retries');
      
      const stats = queue.getStats();
      assertEqual(stats.processed, 0, 'Should have processed 0 jobs');
      assertEqual(stats.failed, 1, 'Should have 1 failed job');
      
      // Check failure events
      const events = queue.getEvents();
      const failureEvents = events.filter(e => e.event === 'jobFailed');
      assertEqual(failureEvents.length, 1, 'Should have 1 failure event');
    }
  },

  {
    name: 'Object-based jobs with execute method',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1 });
      
      const jobObject = {
        data: 'test data',
        async execute() {
          return { processed: true, data: this.data };
        }
      };
      
      const result = await queue.add(jobObject);
      
      assert(result.processed === true, 'Job should be processed');
      assertEqual(result.data, 'test data', 'Should access job object data');
      
      const stats = queue.getStats();
      assertEqual(stats.processed, 1, 'Should have processed 1 job');
    }
  },

  {
    name: 'Invalid job format handling',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1 });
      
      const invalidJob = { not: 'executable' }; // No execute method or function
      
      let errorThrown = false;
      try {
        await queue.add(invalidJob);
      } catch (error) {
        errorThrown = true;
        assertEqual(error.message, 'Invalid job format', 'Should throw invalid format error');
      }
      
      assert(errorThrown, 'Should throw error for invalid job');
      
      const stats = queue.getStats();
      assertEqual(stats.failed, 1, 'Should have 1 failed job');
    }
  },

  {
    name: 'Queue statistics tracking',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 2 });
      
      // Initial stats
      let stats = queue.getStats();
      assertEqual(stats.processed, 0, 'Initial processed should be 0');
      assertEqual(stats.failed, 0, 'Initial failed should be 0');
      assertEqual(stats.queued, 0, 'Initial queued should be 0');
      assertEqual(stats.processing, 0, 'Initial processing should be 0');
      
      // Add jobs without waiting
      const job1Promise = queue.add(async () => {
        await sleep(100);
        return 'job1';
      });
      
      const job2Promise = queue.add(async () => {
        await sleep(50);
        return 'job2';
      });
      
      const job3Promise = queue.add(async () => {
        await sleep(25);
        return 'job3';
      });
      
      // Check intermediate stats (some jobs may have started already)
      await sleep(10); // Give jobs time to start
      stats = queue.getStats();
      assert(stats.processing <= 2, 'Should respect concurrency limit');
      
      // Wait for all jobs to complete
      await Promise.all([job1Promise, job2Promise, job3Promise]);
      
      // Final stats
      stats = queue.getStats();
      assertEqual(stats.processed, 3, 'Should have processed 3 jobs');
      assertEqual(stats.failed, 0, 'Should have 0 failed jobs');
      assertEqual(stats.queued, 0, 'Should have 0 queued jobs');
      assertEqual(stats.processing, 0, 'Should have 0 processing jobs');
    }
  },

  {
    name: 'Event emission tracking',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1 });
      
      const testJob = async () => {
        await sleep(50);
        return 'completed';
      };
      
      await queue.add(testJob);
      
      const events = queue.getEvents();
      
      // Check for expected events
      const addedEvents = events.filter(e => e.event === 'jobAdded');
      assertEqual(addedEvents.length, 1, 'Should have 1 jobAdded event');
      
      const startedEvents = events.filter(e => e.event === 'jobStarted');
      assertEqual(startedEvents.length, 1, 'Should have 1 jobStarted event');
      
      const completedEvents = events.filter(e => e.event === 'jobCompleted');
      assertEqual(completedEvents.length, 1, 'Should have 1 jobCompleted event');
      
      // Events should have timestamps
      events.forEach(event => {
        assert(typeof event.timestamp === 'number', 'Event should have timestamp');
      });
    }
  },

  {
    name: 'Queue clear functionality',
    fn: async () => {
      const queue = new TestMediaQueue({ concurrency: 1 });
      
      // Add several jobs that won't start immediately
      let jobStartCount = 0;
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const job = async () => {
          jobStartCount++;
          await sleep(100);
          return i;
        };
        promises.push(queue.add(job).catch(error => ({ isError: true, error })));
      }
      
      // Clear the queue quickly before most jobs start
      // (first job may start, but others should be cleared)
      setImmediate(() => queue.clear());
      
      // Wait for all promises to settle
      const results = await Promise.all(promises);
      
      let rejectedCount = 0;
      let succeededCount = 0;
      
      for (const result of results) {
        if (result.isError) {
          rejectedCount++;
          assertEqual(result.error.message, 'Queue cleared', 'Should have clear error message');
        } else {
          succeededCount++;
        }
      }
      
      // At least some jobs should be rejected (most likely 4 out of 5)
      assert(rejectedCount >= 3, `Should reject most jobs (got ${rejectedCount} rejected, ${succeededCount} succeeded)`);
      
      const stats = queue.getStats();
      assertEqual(stats.queued, 0, 'Queue should be empty after clear');
      assertEqual(stats.processing, 0, 'No jobs should be processing after clear');
    }
  }
];

async function main() {
  try {
    await runTestSuite('MediaQueue Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };