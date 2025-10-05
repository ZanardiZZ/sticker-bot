# Animated WebP Processing Implementation

## Overview

This document describes the implementation of Sharp-based animated WebP processing to replace the problematic FFmpeg-based approach.

## Problem Statement

The original implementation processed animated WebP stickers using FFmpeg through the `processGif()` function. However, FFmpeg has poor support for animated WebP files, leading to:

- Processing failures and timeouts
- Resource contention issues
- Inconsistent frame extraction
- Fallback to single-frame analysis

## Solution

### New Architecture

1. **Dedicated WebP Processor**: Created `processAnimatedWebp()` function specifically for WebP files
2. **Sharp Integration**: Uses Sharp library's native animated WebP support
3. **Separation of Concerns**: Keeps `processGif()` for actual GIF files, `processAnimatedWebp()` for WebP files

### Key Files Modified

#### `services/videoProcessor.js`
- Added new `processAnimatedWebp()` function
- Exports the function alongside existing processors
- Uses Sharp's native WebP frame extraction capabilities

#### `mediaProcessor.js`  
- Imports `processAnimatedWebp` function
- Updated animated WebP processing logic (line ~242) to call `processAnimatedWebp()` instead of `processGif()`
- Updated error messages to reflect WebP-specific processing

## Technical Implementation

### Frame Extraction Process

1. **Metadata Analysis**: Uses Sharp to read WebP metadata and determine frame count
2. **Static Detection**: Handles static WebP files as single-frame images
3. **Frame Distribution**: For animated WebP, extracts up to 3 frames evenly distributed:
   - Single frame: index 0
   - Two frames: indices 0, 1  
   - Three+ frames: first, middle, last
4. **Temporary Files**: Creates unique temporary directories for frame storage
5. **AI Analysis**: Processes each frame using `getAiAnnotationsForGif()`
6. **Cleanup**: Automatically removes temporary files and directories

### Error Handling

- **Corrupted Files**: Detects Sharp format errors and provides appropriate fallback
- **Frame Extraction Failures**: Graceful degradation with meaningful error tags
- **Missing Dependencies**: Handles cases where AI processing is unavailable
- **Resource Management**: Proper cleanup even on errors

### Environment Variables

The implementation respects the existing `DISABLE_MULTIFRAME_WEBP_ANALYSIS` environment variable:
- `true`: Uses single-frame analysis (fallback mode)
- `false` or unset: Uses multi-frame analysis (default behavior)

## Backward Compatibility

- **Existing GIF Processing**: Unchanged, still uses FFmpeg via `processGif()`
- **Environment Variables**: All existing configuration options preserved
- **Database Schema**: No changes required
- **API Contracts**: Function signatures and return formats maintained

## Testing

### Test Coverage

1. **Unit Tests** (`tests/unit/animatedWebpProcessor.test.js`):
   - WebP detection logic
   - Function exports
   - Error handling
   - Temp directory logic

2. **Integration Tests** (`tests/integration/animatedWebpIntegration.test.js`):
   - Full processing flow
   - File creation and cleanup
   - Error scenarios

3. **Flow Tests** (`tests/integration/mediaProcessorWebpFlow.test.js`):
   - Media processor integration
   - Environment variable behavior
   - Decision logic validation

### Test Results
- All new tests: **13/13 passing**
- Existing tests: **All passing**
- No regressions detected

## Performance Benefits

1. **Native WebP Support**: Sharp handles WebP natively, avoiding format conversion overhead
2. **Reduced Dependencies**: No longer relies on FFmpeg for WebP processing
3. **Better Resource Management**: More predictable memory and disk usage
4. **Faster Processing**: Direct frame access without intermediate video processing

## Usage

### For Developers

The change is transparent to users - animated WebP stickers will now be processed more reliably:

```javascript
// Before: Used FFmpeg-based processGif() for animated WebP
const aiResult = await processGif(filePath);

// After: Uses Sharp-based processAnimatedWebp() for animated WebP  
const aiResult = await processAnimatedWebp(filePath);
```

### Configuration

No configuration changes required. The implementation automatically:
- Detects animated WebP files using existing detection logic
- Routes them to the appropriate processor
- Maintains all existing environment variable behaviors

## Future Improvements

1. **Configurable Frame Count**: Allow customization of frames extracted (currently 3 max)
2. **Caching**: Cache frame extractions for repeated processing
3. **Parallel Processing**: Process multiple frames concurrently
4. **Quality Settings**: Expose Sharp quality/compression settings

## Migration Notes

- **No Breaking Changes**: Drop-in replacement for FFmpeg WebP processing
- **No Database Migration**: Existing media records unaffected  
- **No Configuration Update**: All existing settings work as before
- **Deployment**: Standard deployment process, no special steps required