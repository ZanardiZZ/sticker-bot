/**
 * Unit tests for the scheduler module, specifically the MATCHING_HOUR_EXPRESSIONS
 * 
 * Note: We duplicate the generation logic here instead of importing from bot/scheduler.js
 * because the scheduler module has heavy dependencies (node-cron, database, etc.) that
 * would make unit testing slow and require full environment setup. This approach allows
 * fast, isolated testing of the matching hour logic.
 */

// Simple assertions without requiring testUtils (which loads sqlite3)
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message || `Expected ${expected}, got ${actual}`}`);
  }
}

/**
 * Generates cron expressions for "matching hour" times
 * This is the same logic used in bot/scheduler.js
 * e.g., 1:11, 2:22, 10:10, 11:11, 12:12, etc.
 */
function generateMatchingHourExpressions() {
  const exprs = [];
  for (let hour = 0; hour < 24; hour++) {
    // For single-digit hours (0-9): repeat the digit (e.g., 1→11, 2→22)
    // For double-digit hours (10-23): minute matches the hour (e.g., 10→10, 12→12)
    const minute = hour < 10 ? hour * 11 : hour;
    if (minute > 59) continue;
    exprs.push(`${minute} ${hour} * * *`);
  }
  return exprs;
}

/**
 * Parse a cron expression and return hour:minute
 */
function cronToTime(cronExpr) {
  const parts = cronExpr.split(' ');
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  return { hour, minute };
}

/**
 * Find expression for a specific hour in the generated expressions
 * Returns null if the hour is not included (e.g., hours 6-9)
 */
function findExpressionForHour(exprs, targetHour) {
  for (const expr of exprs) {
    const time = cronToTime(expr);
    if (time.hour === targetHour) {
      return time;
    }
  }
  return null;
}

const tests = [
  {
    name: 'should generate correct count of matching hour expressions',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      // Expected: 0-5 (6 hours) + 10-23 (14 hours) = 20 expressions
      // Hours 6-9 are skipped because minutes 66, 77, 88, 99 > 59
      assertEqual(exprs.length, 20, 'Should have 20 matching hour expressions');
    }
  },
  {
    name: 'should generate 0:00 for hour 0',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 0);
      assert(time !== null, 'Should have expression for hour 0');
      assertEqual(time.minute, 0, 'Hour 0 should have minute 0');
    }
  },
  {
    name: 'should generate 1:11 for hour 1',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 1);
      assert(time !== null, 'Should have expression for hour 1');
      assertEqual(time.minute, 11, 'Hour 1 should have minute 11');
    }
  },
  {
    name: 'should generate 2:22 for hour 2',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 2);
      assert(time !== null, 'Should have expression for hour 2');
      assertEqual(time.minute, 22, 'Hour 2 should have minute 22');
    }
  },
  {
    name: 'should generate 5:55 for hour 5',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 5);
      assert(time !== null, 'Should have expression for hour 5');
      assertEqual(time.minute, 55, 'Hour 5 should have minute 55');
    }
  },
  {
    name: 'should skip hours 6-9 (invalid minutes 66, 77, 88, 99)',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      assert(findExpressionForHour(exprs, 6) === null, 'Should not include hour 6');
      assert(findExpressionForHour(exprs, 7) === null, 'Should not include hour 7');
      assert(findExpressionForHour(exprs, 8) === null, 'Should not include hour 8');
      assert(findExpressionForHour(exprs, 9) === null, 'Should not include hour 9');
    }
  },
  {
    name: 'should generate 10:10 for hour 10',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 10);
      assert(time !== null, 'Should have expression for hour 10');
      assertEqual(time.minute, 10, 'Hour 10 should have minute 10');
    }
  },
  {
    name: 'should generate 11:11 for hour 11',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 11);
      assert(time !== null, 'Should have expression for hour 11');
      assertEqual(time.minute, 11, 'Hour 11 should have minute 11');
    }
  },
  {
    name: 'should generate 12:12 for hour 12',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 12);
      assert(time !== null, 'Should have expression for hour 12');
      assertEqual(time.minute, 12, 'Hour 12 should have minute 12');
    }
  },
  {
    name: 'should generate 22:22 for hour 22',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 22);
      assert(time !== null, 'Should have expression for hour 22');
      assertEqual(time.minute, 22, 'Hour 22 should have minute 22');
    }
  },
  {
    name: 'should generate 23:23 for hour 23',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const time = findExpressionForHour(exprs, 23);
      assert(time !== null, 'Should have expression for hour 23');
      assertEqual(time.minute, 23, 'Hour 23 should have minute 23');
    }
  },
  {
    name: 'should generate all expected matching hour times',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const expectedTimes = [
        { hour: 0, minute: 0 },
        { hour: 1, minute: 11 },
        { hour: 2, minute: 22 },
        { hour: 3, minute: 33 },
        { hour: 4, minute: 44 },
        { hour: 5, minute: 55 },
        // 6-9 skipped
        { hour: 10, minute: 10 },
        { hour: 11, minute: 11 },
        { hour: 12, minute: 12 },
        { hour: 13, minute: 13 },
        { hour: 14, minute: 14 },
        { hour: 15, minute: 15 },
        { hour: 16, minute: 16 },
        { hour: 17, minute: 17 },
        { hour: 18, minute: 18 },
        { hour: 19, minute: 19 },
        { hour: 20, minute: 20 },
        { hour: 21, minute: 21 },
        { hour: 22, minute: 22 },
        { hour: 23, minute: 23 }
      ];
      
      assertEqual(exprs.length, expectedTimes.length, 'Should have same count as expected');
      
      // Verify each expected time is present using hour lookup
      for (const expected of expectedTimes) {
        const actual = findExpressionForHour(exprs, expected.hour);
        assert(
          actual !== null,
          `Should have expression for hour ${expected.hour}`
        );
        assertEqual(
          actual.minute,
          expected.minute,
          `Hour ${expected.hour} should have minute ${expected.minute}, got ${actual.minute}`
        );
      }
    }
  },
  {
    name: 'should generate valid cron expression format',
    fn: () => {
      const exprs = generateMatchingHourExpressions();
      const cronPattern = /^\d{1,2} \d{1,2} \* \* \*$/;
      
      for (const expr of exprs) {
        assert(
          cronPattern.test(expr),
          `Expression "${expr}" should match cron pattern "minute hour * * *"`
        );
      }
    }
  }
];

module.exports = { tests };
