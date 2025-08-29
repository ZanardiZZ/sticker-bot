# Multi-frame Analysis Disable Feature

## Overview

The `DISABLE_MULTIFRAME_WEBP_ANALYSIS` environment variable provides a way to completely disable multi-frame analysis for animated WebP stickers. This feature was added to address resource contention issues that occur when processing multiple media files simultaneously.

## Problem Addressed

When multiple media files (more than 3) are sent to the bot simultaneously, FFmpeg-based frame extraction can cause resource contention, leading to repeated failures with the error:

```
📝 Erro no processamento do GIF: GIF frame extraction failed completely - will trigger single-frame analysis fallback
🏷️ #gif #erro #processamento
🆔 1400
```

## Solution

By setting `DISABLE_MULTIFRAME_WEBP_ANALYSIS=true`, all animated WebP stickers will be processed as single-frame images, bypassing the resource-intensive multi-frame analysis entirely.

## Configuration

### Environment Variable

Add to your `.env` file:

```bash
# Disable multi-frame analysis for animated WebP stickers (default: false)
# When enabled, animated stickers will be processed as single-frame images
# This can help diagnose FFmpeg resource contention issues
DISABLE_MULTIFRAME_WEBP_ANALYSIS=true
```

### Behavior

| Value | Behavior |
|-------|----------|
| `true` | **Disabled**: All animated WebP stickers processed as single-frame images |
| `false` or unset | **Enabled**: Normal multi-frame analysis (default behavior) |

## Impact Analysis

### With Multi-frame Analysis Enabled (Default)
- ✅ More detailed analysis of animated stickers (3 frames analyzed)
- ✅ Better content detection for animated content
- ❌ Resource contention when processing multiple files simultaneously
- ❌ May cause timeouts and failures under high load

### With Multi-frame Analysis Disabled
- ✅ No resource contention issues
- ✅ Faster processing under high concurrent load
- ✅ More reliable operation when processing multiple files
- ❌ Less detailed analysis (only first frame analyzed)
- ❌ May miss content that appears in later frames of animation

## Use Cases

### When to Enable (set to `true`)
1. **High concurrent load**: When bot receives many media files simultaneously
2. **Resource-constrained environments**: Limited CPU or memory
3. **Debugging FFmpeg issues**: To isolate whether problems are FFmpeg-related
4. **Production stability**: When reliability is more important than detailed analysis

### When to Keep Disabled (default behavior)
1. **Low concurrent load**: Single or few media files at a time
2. **High-spec environments**: Sufficient CPU and memory resources
3. **Detailed analysis needed**: When animated content analysis is important
4. **Development/testing**: When testing multi-frame functionality

## Testing

### Unit Tests
The feature includes comprehensive unit tests in `tests/unit/multiFrameDisabled.test.js`:

```bash
npm run test:unit
```

### Manual Testing
A demonstration script is available at `tests/manual/multiFrameDisableDemo.js`:

```bash
# Test with default behavior
node tests/manual/multiFrameDisableDemo.js

# Test with feature enabled
DISABLE_MULTIFRAME_WEBP_ANALYSIS=true node tests/manual/multiFrameDisableDemo.js
```

## Monitoring

### Log Messages

When the feature is **enabled** (`true`):
```
⚠️ Multi-frame analysis disabled via DISABLE_MULTIFRAME_WEBP_ANALYSIS - using single-frame analysis for animated sticker
✅ Animated sticker processed using single-frame analysis (disabled multi-frame)
```

When the feature is **disabled** (default):
```
🎬 Processing animated sticker using multi-frame analysis...
✅ Animated sticker processed successfully: [description]...
```

### Performance Monitoring

Monitor these metrics when testing the feature:
- Processing time per animated sticker
- Number of concurrent processing failures
- FFmpeg timeout errors
- Overall bot responsiveness

## Implementation Details

### Code Location
- **Main logic**: `mediaProcessor.js` (lines 220-270)
- **Environment variable check**: `process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS === 'true'`
- **Configuration**: `.env.example` (lines 89-95)

### Processing Flow

```
Animated WebP detected
        ↓
Check DISABLE_MULTIFRAME_WEBP_ANALYSIS
        ↓
    true ────────────────────→ Single-frame analysis
        ↓                           ↓
    false                      Skip FFmpeg processing
        ↓                           ↓
Multi-frame analysis         Faster, more reliable
        ↓
FFmpeg frame extraction
        ↓
May cause resource contention
```

## Troubleshooting

### Common Issues

1. **Environment variable not working**
   - Ensure exact spelling: `DISABLE_MULTIFRAME_WEBP_ANALYSIS`
   - Ensure value is exactly `true` (case-sensitive)
   - Restart the bot after changing .env

2. **Still getting FFmpeg errors**
   - Check that animated WebP files are being processed (not GIFs)
   - Verify the environment variable is being read (check logs)
   - Static WebP files will still use single-frame analysis regardless

3. **Analysis quality decreased**
   - This is expected when the feature is enabled
   - Consider using only during high-load periods
   - Monitor if the trade-off is acceptable for your use case

### Diagnostic Commands

```bash
# Check if environment variable is set
echo $DISABLE_MULTIFRAME_WEBP_ANALYSIS

# Test the feature
node tests/manual/multiFrameDisableDemo.js

# Run all tests
npm test
```

## Migration Guide

### Enabling the Feature

1. Add to `.env`:
   ```bash
   DISABLE_MULTIFRAME_WEBP_ANALYSIS=true
   ```

2. Restart the bot:
   ```bash
   # If using PM2
   pm2 restart sticker-bot

   # If running directly
   # Stop and restart the bot process
   ```

3. Monitor logs for confirmation:
   ```
   ⚠️ Multi-frame analysis disabled via DISABLE_MULTIFRAME_WEBP_ANALYSIS
   ```

### Disabling the Feature

1. Remove from `.env` or set to `false`:
   ```bash
   DISABLE_MULTIFRAME_WEBP_ANALYSIS=false
   ```

2. Restart the bot

3. Monitor logs for confirmation:
   ```
   🎬 Processing animated sticker using multi-frame analysis...
   ```

## Support

This feature addresses issue #118: "Multi frame analysis error" and provides a workaround for resource contention issues when processing multiple media files simultaneously.

For additional support or feature requests, please refer to the project's issue tracker.