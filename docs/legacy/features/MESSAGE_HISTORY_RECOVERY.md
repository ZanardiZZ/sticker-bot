# Message History Recovery Feature

## Overview

This feature automatically recovers and processes WhatsApp messages that were not handled when they were originally sent. This is useful when:
- The bot was offline when messages were sent
- The message processing queue was full and rejected messages
- Messages failed to process due to temporary errors

## How It Works

### Message Tracking

Every message that is successfully processed by the bot is recorded in the `processed_messages` database table with:
- `message_id` - Unique WhatsApp message identifier
- `chat_id` - Chat where the message was received
- `processed_at` - Timestamp when the message was processed

Before processing any message, the bot checks if it has already been processed to avoid duplicates.

### History Recovery

On bot startup, the history recovery service:
1. Fetches recent message history from configured chats
2. Filters out messages that have already been processed
3. Processes unprocessed messages in batches (default: 10 at a time)
4. Marks each successfully processed message to prevent re-processing

### Database Schema

```sql
CREATE TABLE processed_messages (
  message_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  processed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX idx_processed_messages_chat_id ON processed_messages(chat_id);
CREATE INDEX idx_processed_messages_processed_at ON processed_messages(processed_at DESC);
```

## Configuration

### Environment Variables

Add these to your `.env` file to configure history recovery:

```bash
# Enable/disable history recovery (default: enabled)
HISTORY_RECOVERY_ENABLED=true

# Number of messages to process at once (default: 10)
HISTORY_BATCH_SIZE=10

# Maximum messages to fetch per chat (default: 50)
HISTORY_MAX_MESSAGES=50

# Specific chats to sync (comma-separated, optional)
# If not set, uses AUTO_SEND_GROUP_ID
HISTORY_SYNC_CHATS=120363123456789012@g.us,120363987654321098@g.us

# Enable periodic history sync (default: disabled)
HISTORY_PERIODIC_SYNC=false

# Interval for periodic sync in hours (default: 24)
HISTORY_SYNC_INTERVAL_HOURS=24
```

### Default Behavior

By default:
- History recovery is **enabled**
- Syncs the `AUTO_SEND_GROUP_ID` chat on startup
- Processes up to 50 messages in batches of 10
- Does **not** run periodic syncs (only on startup)

### Disabling History Recovery

To disable the feature completely:

```bash
HISTORY_RECOVERY_ENABLED=false
```

## API Reference

### Database Model (`database/models/processedMessages.js`)

#### `markMessageAsProcessed(messageId, chatId)`
Mark a message as processed.

```javascript
await markMessageAsProcessed('message-id-123', 'chat-id-456');
```

#### `isMessageProcessed(messageId)`
Check if a message has been processed.

```javascript
const processed = await isMessageProcessed('message-id-123');
if (processed) {
  console.log('Message already processed');
}
```

#### `getProcessedMessageIds(messageIds)`
Batch check multiple messages.

```javascript
const processedIds = await getProcessedMessageIds(['msg-1', 'msg-2', 'msg-3']);
// Returns Set: {'msg-1', 'msg-3'}
```

#### `getProcessedMessageCount(chatId)`
Get count of processed messages.

```javascript
const total = await getProcessedMessageCount(); // All chats
const chatCount = await getProcessedMessageCount('chat-id-123'); // Specific chat
```

#### `cleanupOldProcessedMessages(daysOld)`
Clean up old records (run periodically to prevent database bloat).

```javascript
const deleted = await cleanupOldProcessedMessages(30); // Delete messages older than 30 days
```

### History Recovery Service (`services/messageHistoryRecovery.js`)

#### `recoverChatHistory(client, chatId, messageHandler)`
Recover message history for a specific chat.

```javascript
const { recoverChatHistory } = require('./services/messageHistoryRecovery');

const result = await recoverChatHistory(client, 'chat-id-123', handleMessage);
console.log(`Recovered ${result.recovered} messages, ${result.errors} errors`);
```

#### `filterUnprocessedMessages(messages)`
Filter out already processed messages from a list.

```javascript
const { filterUnprocessedMessages } = require('./services/messageHistoryRecovery');

const allMessages = await fetchMessages();
const unprocessed = await filterUnprocessedMessages(allMessages);
```

## Maintenance

### Database Cleanup

To prevent the `processed_messages` table from growing indefinitely, periodically clean up old records:

```javascript
const { cleanupOldProcessedMessages } = require('./database');

// Run this via cron or periodic task
const deleted = await cleanupOldProcessedMessages(30); // Keep last 30 days
console.log(`Cleaned up ${deleted} old message records`);
```

### Monitoring

Check history recovery logs in the console:

```
[HistoryInit] Starting history recovery for chat: 120363123456789012@g.us
[HistoryRecovery] Fetching up to 50 messages from 120363123456789012@g.us
[HistoryRecovery] Filtered 45 messages: 12 unprocessed, 33 already processed
[HistoryRecovery] Processing 12 messages in 2 batches of 10
[HistoryRecovery] Processing batch 1/2 (10 messages)
[HistoryRecovery] Processing batch 2/2 (2 messages)
[HistoryRecovery] Batch processing complete: 12 successful, 0 errors
[HistoryInit] History recovery completed for 120363123456789012@g.us: 12 messages recovered, 0 errors
```

## Testing

Run the test suite to verify the feature:

```bash
# Run all tests
npm run test:unit

# Run specific test files
node tests/unit/processedMessagesModel.test.js
node tests/unit/messageHistoryRecovery.test.js
```

Test coverage includes:
- Database operations (insert, check, count, cleanup)
- Message filtering and deduplication
- Batch processing with error handling
- Configuration validation

## Troubleshooting

### Messages not being recovered

1. Check if history recovery is enabled:
   ```bash
   grep HISTORY_RECOVERY_ENABLED .env
   ```

2. Verify chat IDs are correct:
   ```bash
   grep -E "AUTO_SEND_GROUP_ID|HISTORY_SYNC_CHATS" .env
   ```

3. Check bot logs for errors:
   ```
   [HistoryInit] Error during history recovery for ...
   ```

### Duplicate messages being processed

If you see duplicate processing, check:
- Message ID extraction is working correctly
- Database writes are successful
- No race conditions in concurrent processing

### Performance issues

If history recovery is slow or causes problems:
- Reduce `HISTORY_MAX_MESSAGES` (default: 50)
- Reduce `HISTORY_BATCH_SIZE` (default: 10)
- Disable periodic sync if enabled

## Implementation Details

### Message ID Extraction

The system supports multiple message ID formats:
```javascript
const messageId = message.id || message.key?.id;
```

### Deduplication Strategy

Messages are deduplicated at two levels:
1. **Before processing**: Check `processed_messages` table
2. **After processing**: Insert into `processed_messages` table

This ensures messages are only processed once, even if:
- History recovery runs multiple times
- Bot restarts during processing
- Network errors cause retries

### Batch Processing

Messages are processed in batches to:
- Avoid overwhelming the system
- Prevent rate limiting
- Allow graceful error handling
- Enable progress monitoring

### Error Handling

The system gracefully handles:
- Network errors during history fetch
- Database errors during tracking
- Processing errors for individual messages
- Missing or invalid message IDs

Errors are logged but don't stop the recovery process.

## Related Issues

- [#247](https://github.com/ZanardiZZ/sticker-bot/issues/247) - Queue overflow handling
- Current PR - Implements automatic history recovery

## Future Enhancements

Potential improvements:
- Priority-based recovery (recent messages first)
- Selective recovery by message type (media only, commands only)
- Recovery statistics and reporting
- Manual recovery trigger via admin command
- Integration with queue health monitoring
