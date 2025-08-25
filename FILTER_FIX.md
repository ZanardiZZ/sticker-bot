# Filter Fix Documentation

## Problem
The website filters were not working and returning 0 stickers for all searches/filters.

## Root Cause
In the `listMedia()` function in `web/dataAccess.js`, the `anyTag` filter was generating invalid SQL syntax:

### Before (Broken)
```sql
FROM media m
AND EXISTS (
  SELECT 1 FROM media_tags mt_any
  ...
)
```

The `AND EXISTS` was appearing without a `WHERE` clause, which is invalid SQL syntax.

### After (Fixed)  
```sql
FROM media m
WHERE EXISTS (
  SELECT 1 FROM media_tags mt_any
  ...
)
```

The `EXISTS` condition is now properly included in the `WHERE` clause.

## Changes Made
1. Moved the `anyTag` filter logic from a separate `subAnyTagFilter` variable to be part of the `whereParts` array
2. This ensures it's properly included in the `WHERE` clause construction
3. The fix maintains backward compatibility with all existing filter combinations

## Filters Verified Working
- ✅ No filters (shows all items)
- ✅ Search query (`q` parameter) 
- ✅ Any tag filter (`any_tag` parameter)
- ✅ All tags filter (`tags` parameter)
- ✅ NSFW filters (`nsfw=0`, `nsfw=1`)
- ✅ Sort options (newest, oldest, popular, etc.)
- ✅ Combined filters
- ✅ Pagination

## Technical Details
The fix was a minimal 4-line change in `/web/dataAccess.js` that:
- Removes the separate `subAnyTagFilter` construction
- Adds the `anyTag` condition directly to the `whereParts` array
- Removes the separate `subAnyTagFilter` from the `baseSQL` construction

This ensures proper SQL syntax while maintaining all existing functionality.