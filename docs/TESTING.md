# Test Suite Documentation

## Overview

This comprehensive test suite provides unit and integration tests for all new modular components created during the database modularization effort. The tests ensure code quality, reliability, and maintainability of the new architecture.

## Test Structure

```
tests/
├── helpers/
│   └── testUtils.js          # Test utilities and helper functions
├── unit/
│   ├── mediaModel.test.js    # Tests for media database model
│   ├── contactsModel.test.js # Tests for contacts database model
│   ├── databaseHandler.test.js # Tests for database handler service
│   ├── mediaQueue.test.js    # Tests for media processing queue
│   └── maintenanceModel.test.js # Tests for maintenance/migration model
├── integration/
│   └── database.test.js      # Integration tests for database modules
├── temp/                     # Temporary test databases (auto-created)
└── runTests.js              # Main test runner
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Individual Test Files
```bash
node tests/unit/mediaModel.test.js
node tests/unit/contactsModel.test.js
node tests/unit/databaseHandler.test.js
node tests/unit/mediaQueue.test.js
node tests/unit/maintenanceModel.test.js
node tests/integration/database.test.js
```

## Test Coverage

### Media Model Tests (8 tests)
- ✅ Save media successfully
- ✅ Find media by visual hash
- ✅ Find media by MD5 hash
- ✅ Get random sticker
- ✅ Update random count
- ✅ Delete media
- ✅ Get media count
- ✅ Get media by page (pagination)

### Contacts Model Tests (9 tests)
- ✅ Upsert contact - insert new
- ✅ Upsert contact - update existing
- ✅ Upsert contact - handle null sender ID
- ✅ Get contact by sender ID
- ✅ Get all contacts
- ✅ Update contact display name
- ✅ Delete contact
- ✅ Search contacts
- ✅ Get top 5 users by sticker count

### DatabaseHandler Tests (11 tests)
- ✅ Basic SQL execution (SELECT, INSERT, UPDATE)
- ✅ Get single record
- ✅ Transaction - successful commit
- ✅ Transaction - rollback on error
- ✅ Error handling - invalid SQL
- ✅ Custom function execution
- ✅ WAL checkpoint
- ✅ Get database statistics
- ✅ Retry mechanism simulation

### MediaQueue Tests (10 tests)
- ✅ Basic job execution
- ✅ Multiple concurrent jobs
- ✅ Concurrency limit enforcement
- ✅ Job retry mechanism
- ✅ Job failure after max retries
- ✅ Object-based jobs with execute method
- ✅ Invalid job format handling
- ✅ Queue statistics tracking
- ✅ Event emission tracking
- ✅ Queue clear functionality

### Maintenance Model Tests (7 tests)
- ✅ Get historical contacts statistics - empty database
- ✅ Get historical contacts statistics - with data
- ✅ Migrate historical contacts - no contacts to migrate
- ✅ Migrate historical contacts - with new contacts
- ✅ Migrate media with missing sender ID - no missing IDs
- ✅ Migrate media with missing sender ID - with missing IDs
- ✅ Migration with custom logger

### Database Integration Tests (6 tests)
- ✅ Database initialization and table creation
- ✅ Cross-model data consistency
- ✅ Foreign key relationships and cascading
- ✅ Concurrent operations handling
- ✅ Transaction rollback across models
- ✅ Database schema migration simulation

**Total: 51 tests, 100% pass rate**

## Test Features

### Isolation and Cleanup
- Each test uses a temporary SQLite database
- Automatic cleanup after each test
- No side effects between tests
- Deterministic test outcomes

### Comprehensive Coverage
- **Unit Tests**: Test individual modules in isolation
- **Integration Tests**: Test modules working together
- **Error Scenarios**: Test error handling and edge cases
- **Concurrency**: Test concurrent operations
- **Transactions**: Test ACID properties

### Realistic Test Data
- Representative sticker metadata
- Various user contact scenarios
- Different database states
- Edge cases (null values, empty strings, duplicates)

### Performance Testing
- Concurrent operation handling
- Queue processing limits
- Retry mechanism behavior
- Transaction rollback performance

## Test Utilities

The `testUtils.js` module provides:

### Database Helpers
- `createTestDatabase(testName)` - Creates isolated test database
- `createTestTables(db)` - Sets up standard schema
- `insertTestMedia(db, data)` - Inserts test media records
- `insertTestContacts(db, data)` - Inserts test contact records

### Assertion Helpers
- `assert(condition, message)` - Basic assertion
- `assertEqual(actual, expected, message)` - Equality assertion
- `assertLength(array, length, message)` - Array length assertion
- `assertArrayEquals(actual, expected, message)` - Array equality with detailed error messages

### Test Runners
- `runTest(name, function)` - Runs single test with error handling
- `runTestSuite(name, tests)` - Runs test suite with reporting

### Utilities
- `sleep(ms)` - Async sleep for timing tests

## Best Practices

### Test Organization
- One test file per module
- Descriptive test names
- Grouped by functionality
- Clear success/failure criteria

### Test Data
- Minimal realistic data
- Isolated test databases
- Automatic cleanup
- No shared state

### Error Handling
- Test both success and failure paths
- Verify error messages
- Test edge cases
- Proper resource cleanup

### Async Testing
- Proper promise handling
- Timeout management
- Concurrent operation testing
- Race condition awareness

## Adding New Tests

When adding new modules or modifying existing ones:

1. Create a new test file in `tests/unit/`
2. Follow the existing naming convention: `moduleName.test.js`
3. Use the test utilities from `testUtils.js`
4. Include the test in `runTests.js`
5. Test both success and error scenarios
6. Ensure proper cleanup of resources

### Example Test Structure

```javascript
const { createTestDatabase, createTestTables, assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

const tests = [
  {
    name: 'Test description',
    fn: async () => {
      const { db, cleanup } = createTestDatabase('test-name');
      await createTestTables(db);
      
      // Test implementation
      
      await cleanup();
    }
  }
];

async function main() {
  await runTestSuite('Module Name Tests', tests);
}

if (require.main === module) {
  main();
}

module.exports = { tests };
```

## Continuous Integration

The test suite is designed to run in CI/CD environments:

- No external dependencies required
- SQLite in-memory databases
- Fast execution (~1-2 seconds total)
- Clear exit codes (0 = success, 1 = failure)
- Detailed error reporting

## Troubleshooting

### Common Issues

**SQLite binding errors**: Run `npm rebuild sqlite3`

**Test database persistence**: Check `.gitignore` excludes `tests/temp/`

**Timeout issues**: Increase timeout in test runner for slow environments

**Permission errors**: Ensure write access to test directory

### Debug Mode

For detailed debugging, modify individual test files to add console logging:

```javascript
console.log('Debug info:', data);
```

Or add breakpoints when running with a debugger:

```bash
node --inspect-brk tests/unit/mediaModel.test.js
```

## Maintenance

Regular maintenance tasks:

1. **Update tests** when modifying database schema
2. **Add tests** for new functionality
3. **Review coverage** to identify gaps
4. **Clean up** obsolete tests
5. **Update documentation** as needed

The test suite should be considered a living part of the codebase and maintained alongside feature development.