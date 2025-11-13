#!/usr/bin/env node
/**
 * Demo script showing MediaQueue behavior with size limits
 * 
 * This demonstrates:
 * 1. Normal queue operation within limits
 * 2. Queue warning when approaching capacity
 * 3. Queue rejection when full
 * 4. User-friendly error messages
 * 
 * Usage: node demos/queue-size-limit-demo.js
 */

const MediaQueue = require('../services/mediaQueue');

// ANSI color codes for better visualization
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function demonstrateQueueBehavior() {
  log('cyan', '\n════════════════════════════════════════════════════════');
  log('cyan', '   MediaQueue Size Limit Demonstration');
  log('cyan', '════════════════════════════════════════════════════════\n');

  // Create a queue with small size for demonstration
  const queue = new MediaQueue({
    concurrency: 2,      // Process 2 jobs at a time
    maxQueueSize: 5,     // Maximum 5 items in queue
    retryAttempts: 2,
    retryDelay: 500
  });

  log('blue', '📋 Queue Configuration:');
  console.log(`   - Concurrency: 2 (2 jobs processed simultaneously)`);
  console.log(`   - Max Queue Size: 5`);
  console.log(`   - Total Capacity: 7 (2 processing + 5 waiting)\n`);

  // Track events
  let warnings = 0;
  let rejections = 0;

  queue.on('queueWarning', (current, max, usage) => {
    warnings++;
    log('yellow', `⚠️  Queue Warning: ${current}/${max} items (${(usage * 100).toFixed(0)}% full)`);
  });

  queue.on('queueFull', (max, current) => {
    rejections++;
    log('red', `🚫 Queue Full: Cannot accept more items (${current}/${max})`);
  });

  queue.on('jobCompleted', (jobId) => {
    const stats = queue.getStats();
    log('green', `✅ Job completed (${stats.waiting} waiting, ${stats.processing} processing)`);
  });

  // Simulate incoming media messages
  log('blue', '\n🚀 Simulating 12 incoming media messages...\n');

  const jobs = [];
  for (let i = 1; i <= 12; i++) {
    // Simulate media processing (takes 1 second)
    const promise = queue.add(async () => {
      log('cyan', `   Processing message ${i}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { messageId: i };
    }).then(result => {
      return { success: true, ...result };
    }).catch(error => {
      if (error.code === 'QUEUE_FULL') {
        log('red', `   ❌ Message ${i} rejected: Queue is full`);
        return { success: false, rejected: true, messageId: i };
      }
      throw error;
    });
    
    jobs.push(promise);
    
    // Small delay between submissions
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  log('blue', '\n⏳ Waiting for all jobs to complete...\n');
  const results = await Promise.all(jobs);

  // Analyze results
  const successful = results.filter(r => r.success).length;
  const rejected = results.filter(r => r.rejected).length;

  const finalStats = queue.getStats();

  log('cyan', '\n════════════════════════════════════════════════════════');
  log('cyan', '   Results Summary');
  log('cyan', '════════════════════════════════════════════════════════\n');

  log('green', `✅ Successfully processed: ${successful} messages`);
  log('red', `❌ Rejected (queue full): ${rejected} messages`);
  
  console.log('\n📊 Queue Statistics:');
  console.log(`   - Total processed: ${finalStats.processed}`);
  console.log(`   - Total rejected: ${finalStats.rejected}`);
  console.log(`   - Failed (errors): ${finalStats.failed}`);
  console.log(`   - Queue capacity: ${finalStats.capacity}`);
  console.log(`   - Current waiting: ${finalStats.waiting}`);
  console.log(`   - Current usage: ${(finalStats.usage * 100).toFixed(1)}%`);

  console.log('\n📢 Events Emitted:');
  console.log(`   - Queue warnings: ${warnings}`);
  console.log(`   - Queue full events: ${rejections}`);

  log('cyan', '\n════════════════════════════════════════════════════════');
  log('cyan', '   Key Takeaways');
  log('cyan', '════════════════════════════════════════════════════════\n');

  console.log('1. Queue accepts jobs up to its capacity limit');
  console.log('2. Warning emitted when queue reaches 75% capacity');
  console.log('3. New jobs rejected when queue is full');
  console.log('4. Users receive friendly error message on rejection');
  console.log('5. Queue continues processing existing jobs normally');
  console.log('6. System remains stable under heavy load\n');

  log('green', '✅ Demo completed successfully!\n');
}

// Run the demo
if (require.main === module) {
  demonstrateQueueBehavior().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

module.exports = { demonstrateQueueBehavior };
