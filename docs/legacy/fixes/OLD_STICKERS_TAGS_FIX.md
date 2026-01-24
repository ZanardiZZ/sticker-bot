# Fix: Old Stickers Missing Tags

## Problem Statement

When processing old stickers from the `OLD_STICKERS_PATH` directory using `#random` command or the cron scheduler, the stickers would receive descriptions from AI but not tags. This meant old stickers couldn't be searched or filtered by tags like regular stickers.

## Root Cause

The `processOldStickers()` function in `database/models/processing.js`:

1. ✅ Called `getAiAnnotations()` to get both description and tags from AI
2. ✅ Extracted tags from AI result: `tags = aiResult.tags ? aiResult.tags.join(',') : null`
3. ❌ **Passed tags to `saveMedia()`, but `saveMedia()` doesn't handle tags!**

The `saveMedia()` function only inserts data into the `media` table - it has no code to handle the `media_tags` junction table or `tags` table.

## Solution

The fix follows the same pattern used elsewhere in the codebase (e.g., `bot/mediaProcessor.js`):

1. Import `updateMediaTags` from the tags model
2. Call `saveMedia()` WITHOUT the tags parameter (since it's ignored)
3. After getting the `mediaId`, call `updateMediaTags(mediaId, tags)` to save tags

## Code Changes

**File: `database/models/processing.js`**

### Change 1: Add import
```javascript
// Before:
const { findByHashVisual, findByHashMd5, saveMedia } = require('./media');

// After:
const { findByHashVisual, findByHashMd5, saveMedia } = require('./media');
const { updateMediaTags } = require('./tags');
```

### Change 2: Remove tags from saveMedia and add updateMediaTags call
```javascript
// Before:
const mediaId = await saveMedia({
  chatId: 'old-stickers',
  groupId: null,
  filePath: sanitizedPath,
  mimetype,
  timestamp: Date.now(),
  description,
  tags,  // ❌ This was ignored!
  hashVisual,
  hashMd5,
  nsfw: 0,
});

await upsertProcessedFile(file, lastModified);

// After:
const mediaId = await saveMedia({
  chatId: 'old-stickers',
  groupId: null,
  filePath: sanitizedPath,
  mimetype,
  timestamp: Date.now(),
  description,
  hashVisual,
  hashMd5,
  nsfw: 0,
});

// Save tags if any were extracted from AI
if (tags && tags.trim()) {
  console.log(`[old-stickers] Salvando tags para media ${mediaId}: "${tags}"`);
  await updateMediaTags(mediaId, tags);
}

await upsertProcessedFile(file, lastModified);
```

## Testing

Two comprehensive tests were created:

1. **Unit Test** (`tests/unit/oldStickersTagsFix.test.js`)
   - Verifies `updateMediaTags` is imported
   - Verifies `updateMediaTags` is called with correct parameters
   - Verifies tags are not passed to `saveMedia`
   - Verifies logging is in place

2. **Integration Test** (`tests/integration/oldStickersTags.test.js`)
   - Simulates the complete flow with a real database
   - Verifies tags are saved to `tags` table
   - Verifies relationships are created in `media_tags` table
   - Verifies tags can be retrieved for the media

## Impact

- ✅ Old stickers now receive tags from AI analysis
- ✅ Old stickers are now searchable by tags
- ✅ Old stickers appear in tag-filtered results
- ✅ Consistent behavior between old and new stickers
- ✅ No breaking changes to existing functionality

## Related Files

- `database/models/processing.js` - Main fix
- `database/models/tags.js` - Contains `updateMediaTags` function
- `database/models/media.js` - Contains `saveMedia` function
- `bot/mediaProcessor.js` - Uses same pattern for regular stickers
