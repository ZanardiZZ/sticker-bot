# High Volume Media Processing & Duplicate Management

This document describes the improvements made to handle high volume media processing and provide duplicate media management capabilities.

## Problem Solved

The bot was experiencing:
1. **SQLITE_BUSY errors** when processing large volumes of media simultaneously
2. **Duplicate media insertion** due to race conditions
3. **Lack of tools** to manage and clean up duplicate media files

## Solution Overview

### 1. Media Processing Queue System

A new queue system (`services/mediaQueue.js`) ensures:
- **Controlled concurrency**: Max 3 simultaneous operations (configurable)
- **Automatic retry**: Up to 5 attempts with exponential backoff for SQLITE_BUSY errors
- **Error recovery**: Proper handling of transient database lock issues
- **Monitoring**: Real-time statistics and event logging

### 2. Enhanced Database Handler

The `services/databaseHandler.js` provides:
- **WAL mode**: Write-Ahead Logging for better concurrent access
- **Busy timeout**: 30-second timeout for locked database operations
- **Transaction support**: Atomic operations with rollback on failure
- **Retry logic**: Automatic retry for database busy conditions

### 3. Duplicate Media Management

New admin features for managing duplicates:
- **Detection**: Efficient hash-based duplicate identification
- **Statistics**: Overview of duplicate media groups and potential savings
- **Bulk deletion**: Remove duplicates while keeping the oldest version
- **Manual selection**: Delete specific media files with confirmation

## Usage

### For Developers

#### Media Processing Queue
```javascript
const { mediaQueue } = require('./database');

// Queue a media processing operation
const result = await mediaQueue.add(async () => {
    // Your database operation here
    return await someDbOperation();
});
```

#### Enhanced Database Operations
```javascript
const { dbHandler } = require('./database');

// Operations automatically retry on SQLITE_BUSY
const media = await dbHandler.get('SELECT * FROM media WHERE id = ?', [mediaId]);
const result = await dbHandler.run('INSERT INTO media (...) VALUES (...)', params);
```

#### Duplicate Detection
```javascript
const { findDuplicateMedia, deleteDuplicateMedia } = require('./database');

// Find duplicate groups
const duplicates = await findDuplicateMedia(50);

// Delete duplicates (keeps oldest)
const deletedCount = await deleteDuplicateMedia(hashVisual);
```

### For Administrators

#### Accessing Duplicate Management

1. Login to the admin panel at `/admin`
2. Navigate to the "Gerenciamento de Mídias Duplicadas" section
3. View statistics and duplicate groups
4. Select groups and delete duplicates as needed

#### API Endpoints

- `GET /api/admin/duplicates/stats` - Get duplicate statistics
- `GET /api/admin/duplicates` - List duplicate groups
- `GET /api/admin/duplicates/:hashVisual` - Get group details
- `DELETE /api/admin/duplicates/:hashVisual` - Delete duplicate group
- `DELETE /api/admin/media/bulk` - Delete specific media by IDs

## Configuration

### Queue Settings
```javascript
const mediaQueue = new MediaQueue({
    concurrency: 3,        // Max simultaneous operations
    retryAttempts: 5,      // Retry attempts for failures
    retryDelay: 1000       // Initial delay in milliseconds
});
```

### Database Settings
```javascript
const dbHandler = new DatabaseHandler(db);
// Automatically configures:
// - WAL mode for better concurrency
// - 30-second busy timeout
// - Normal synchronous mode for performance
```

## Performance Improvements

1. **Database Indexes**: Added critical indexes for `hash_visual` and `hash_md5`
2. **WAL Mode**: Enables concurrent reads while writing
3. **Queue Batching**: Prevents database overwhelm during high load
4. **Connection Reuse**: Single database connection with proper management

## Safety Features

1. **Always Keep Oldest**: Duplicate deletion preserves the original media
2. **Confirmation Dialogs**: Admin UI requires confirmation for destructive actions
3. **Transaction Rollback**: Failed operations don't leave partial changes
4. **Detailed Logging**: All operations are logged for auditing

## Monitoring

### Queue Statistics
- **Processed**: Successfully completed operations
- **Failed**: Permanently failed operations after all retries  
- **Queued**: Operations waiting to be processed
- **Processing**: Currently executing operations

### Admin Dashboard
- **Duplicate Groups**: Number of hash groups with duplicates
- **Total Duplicates**: Total number of duplicate media files
- **Potential Savings**: Number of files that can be safely deleted

## Testing

Run the test suite to verify functionality:
```bash
node test-media-queue.js
```

The test validates:
- Queue concurrency and timing
- Retry logic for SQLITE_BUSY errors
- Queue management and statistics
- Error handling and recovery

## Migration Notes

- **Existing Code**: All existing functions work unchanged
- **New Features**: Queue system is transparent to existing code
- **Database**: New indexes are added automatically on startup
- **Performance**: Immediate improvement for high-volume scenarios

## Troubleshooting

### High Memory Usage
- Reduce queue concurrency if memory usage is high
- Monitor queue statistics for buildup of pending operations

### SQLITE_BUSY Errors Still Occurring
- Check if operations are bypassing the queue system
- Increase retry attempts or delay for problematic operations
- Verify WAL mode is enabled (`PRAGMA journal_mode = WAL`)

### Duplicate Detection Issues
- Ensure `hash_visual` index exists and is up to date
- Check if media files are being processed with proper hash generation
- Verify filesystem permissions for file deletion

## Future Enhancements

1. **Metrics Dashboard**: Real-time queue and database performance metrics
2. **Auto-Cleanup**: Scheduled duplicate detection and cleanup
3. **Advanced Duplicate Detection**: Similarity-based duplicate detection beyond exact hash matches
4. **Backup Integration**: Backup files before deletion for safety