/**
 * Unit test for MediaQueue enhancements for media processing retries
 * Tests the fix for issue #116 - Queue system fails multiframe analysis
 */

const MediaQueue = require('../../services/mediaQueue');

// Mock functions to simulate different error scenarios
const mockJobs = {
  // Simulates successful processing
  successfulJob: async () => {
    return { result: 'success' };
  },
  
  // Simulates SQL busy error (should be retried)
  sqlBusyJob: async () => {
    const error = new Error('SQLITE_BUSY error');
    error.code = 'SQLITE_BUSY';
    throw error;
  },
  
  // Simulates resource contention error (should be retried)
  resourceContentionJob: async () => {
    throw new Error('GIF frame extraction failed completely - resource contention detected - retryable');
  },
  
  // Simulates permanent GIF error (should not be retried)
  permanentGifErrorJob: async () => {
    throw new Error('GIF frame extraction failed completely - will trigger single-frame analysis fallback');
  },
  
  // Simulates timeout error (should be retried)
  timeoutJob: async () => {
    throw new Error('Timeout ao extrair frame 1 após 30 segundos');
  },
  
  // Simulates ffmpeg error (should be retried)
  ffmpegJob: async () => {
    throw new Error('Cannot find ffprobe - FFmpeg não consegue processar');
  }
};

const tests = [
  {
    name: 'Queue should retry resource contention errors',
    fn: async () => {
      const queue = new MediaQueue({ concurrency: 1, retryAttempts: 2, retryDelay: 50 });
      
      let attemptCount = 0;
      const retryableJob = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('GIF frame extraction failed completely - resource contention detected - retryable');
        }
        return { success: true, attempts: attemptCount };
      };
      
      const result = await queue.add(retryableJob);
      
      if (result.attempts !== 2) {
        throw new Error(`Expected 2 attempts, got ${result.attempts}`);
      }
      
      console.log('✅ Resource contention error was properly retried');
    }
  },

  {
    name: 'Queue should not retry permanent GIF errors',
    fn: async () => {
      const queue = new MediaQueue({ concurrency: 1, retryAttempts: 3, retryDelay: 50 });
      
      let attemptCount = 0;
      const permanentErrorJob = async () => {
        attemptCount++;
        throw new Error('GIF frame extraction failed completely - will trigger single-frame analysis fallback');
      };
      
      let errorThrown = false;
      try {
        await queue.add(permanentErrorJob);
      } catch (error) {
        errorThrown = true;
        if (attemptCount !== 1) {
          throw new Error(`Expected 1 attempt for permanent error, got ${attemptCount}`);
        }
      }
      
      if (!errorThrown) {
        throw new Error('Expected permanent error to be thrown without retries');
      }
      
      console.log('✅ Permanent GIF error was not retried (correct behavior)');
    }
  },

  {
    name: 'Queue should retry timeout errors',
    fn: async () => {
      const queue = new MediaQueue({ concurrency: 1, retryAttempts: 2, retryDelay: 50 });
      
      let attemptCount = 0;
      const timeoutJob = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Timeout ao extrair frame 1 após 30 segundos');
        }
        return { success: true, attempts: attemptCount };
      };
      
      const result = await queue.add(timeoutJob);
      
      if (result.attempts !== 2) {
        throw new Error(`Expected 2 attempts for timeout error, got ${result.attempts}`);
      }
      
      console.log('✅ Timeout error was properly retried');
    }
  },

  {
    name: 'Queue should retry FFmpeg errors', 
    fn: async () => {
      const queue = new MediaQueue({ concurrency: 1, retryAttempts: 2, retryDelay: 50 });
      
      let attemptCount = 0;
      const ffmpegJob = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Cannot find ffprobe - processamento concorrente');
        }
        return { success: true, attempts: attemptCount };
      };
      
      const result = await queue.add(ffmpegJob);
      
      if (result.attempts !== 2) {
        throw new Error(`Expected 2 attempts for FFmpeg error, got ${result.attempts}`);
      }
      
      console.log('✅ FFmpeg error was properly retried');
    }
  },

  {
    name: 'Queue should handle concurrent media processing with retries',
    fn: async () => {
      const queue = new MediaQueue({ concurrency: 2, retryAttempts: 2, retryDelay: 50 });
      
      let job1Attempts = 0;
      let job2Attempts = 0;
      
      const job1 = async () => {
        job1Attempts++;
        if (job1Attempts < 2) {
          throw new Error('GIF frame extraction failed completely - resource contention detected - retryable');
        }
        return { id: 'job1', attempts: job1Attempts };
      };
      
      const job2 = async () => {
        job2Attempts++;
        // This one succeeds immediately
        return { id: 'job2', attempts: job2Attempts };
      };
      
      const [result1, result2] = await Promise.all([
        queue.add(job1),
        queue.add(job2)
      ]);
      
      if (result1.attempts !== 2) {
        throw new Error(`Job1 expected 2 attempts, got ${result1.attempts}`);
      }
      
      if (result2.attempts !== 1) {
        throw new Error(`Job2 expected 1 attempt, got ${result2.attempts}`);
      }
      
      console.log('✅ Concurrent processing with retries works correctly');
    }
  }
];

// Helper function to run tests
async function runTests() {
  console.log('🧪 Testing MediaQueue enhancements for media processing...\n');
  
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
    }
  }
  
  console.log('============================================================');
  if (passed === total) {
    console.log('🎉 All MediaQueue processing tests passed!');
    console.log('\n📋 Summary of enhancements:');
    console.log('  ✅ Resource contention errors are properly retried');
    console.log('  ✅ Permanent errors skip retry and fail fast');
    console.log('  ✅ Timeout and FFmpeg errors are retried with backoff');
    console.log('  ✅ Concurrent processing works with retry logic');
    console.log('\n🔧 This fixes the queue system multiframe analysis issue!');
  } else {
    console.log(`❌ ${total - passed} out of ${total} tests failed`);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { tests };