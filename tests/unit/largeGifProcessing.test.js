/**
 * Test for large GIF processing with dimension reduction
 * Verifies fix for issue: "gifs muito grandes estão sendo convertidos para stickers estáticos"
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const MAX_STICKER_BYTES = 1024 * 1024; // 1MB

/**
 * Creates a test GIF image that can be used for testing
 * Uses Sharp to create a PNG first, then converts to GIF
 */
async function createTestGif(width, height, filename) {
  const tempDir = '/tmp';
  const pngPath = path.join(tempDir, `${filename}.png`);
  const gifPath = path.join(tempDir, `${filename}.gif`);
  
  // Create a colorful test image
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = (i % 256);     // R
    pixels[i + 1] = 255 - (i % 256); // G
    pixels[i + 2] = (i * 2) % 256;   // B
    pixels[i + 3] = 255;       // A
  }
  
  // Create PNG first
  await sharp(pixels, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
  .png()
  .toFile(pngPath);
  
  // Convert to GIF
  await sharp(pngPath)
    .gif()
    .toFile(gifPath);
  
  // Clean up PNG
  try { fs.unlinkSync(pngPath); } catch {}
  
  return gifPath;
}

const tests = [
  {
    name: 'Large GIF should be resized with dimension reduction',
    fn: async () => {
      // Create a large GIF (1000x1000)
      const largeGifPath = await createTestGif(1000, 1000, 'large-gif-test');
      
      try {
        const gifSharp = sharp(largeGifPath, { animated: true });
        const metadata = await gifSharp.metadata();
        const { width, height } = metadata;
        
        console.log(`Original GIF size: ${width}x${height}`);
        
        // Simulate the conversion logic from mediaProcessor.js
        const qualityLevels = [
          { quality: 85, nearLossless: true },
          { quality: 75, nearLossless: false },
          { quality: 65, nearLossless: false }
        ];
        
        const dimensionTargets = [512, 480, 400, 320];
        
        let successBuffer = null;
        let successDimension = null;
        
        // Try quality reduction first
        for (const qualityAttempt of qualityLevels) {
          try {
            const candidate = await gifSharp
              .clone()
              .webp({ 
                loop: 0,
                effort: 6,
                smartSubsample: true,
                lossless: false,
                ...qualityAttempt
              })
              .toBuffer();
            
            if (candidate.length <= MAX_STICKER_BYTES) {
              successBuffer = candidate;
              console.log(`✓ Quality reduction worked at quality ${qualityAttempt.quality}: ${Math.round(candidate.length / 1024)}KB`);
              break;
            }
          } catch (err) {
            console.warn(`Quality attempt ${qualityAttempt.quality} failed:`, err.message);
          }
        }
        
        // If still too large, try dimension reduction
        if (!successBuffer || successBuffer.length > MAX_STICKER_BYTES) {
          console.log('Quality reduction alone not enough, trying dimension reduction...');
          
          for (const targetSize of dimensionTargets) {
            if (width <= targetSize && height <= targetSize) {
              continue;
            }
            
            for (const qualityAttempt of qualityLevels) {
              try {
                // Reuse original Sharp instance with clone() for efficiency
                const candidate = await gifSharp
                  .clone()
                  .resize(targetSize, targetSize, {
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .webp({
                    loop: 0,
                    effort: 6,
                    smartSubsample: true,
                    lossless: false,
                    ...qualityAttempt
                  })
                  .toBuffer();
                
                if (candidate.length <= MAX_STICKER_BYTES) {
                  successBuffer = candidate;
                  successDimension = targetSize;
                  console.log(`✓ Dimension reduction worked at ${targetSize}px, quality ${qualityAttempt.quality}: ${Math.round(candidate.length / 1024)}KB`);
                  break;
                }
              } catch (err) {
                console.warn(`Resize to ${targetSize}px failed:`, err.message);
              }
            }
            
            if (successBuffer && successBuffer.length <= MAX_STICKER_BYTES) {
              break;
            }
          }
        }
        
        // Verify we got a result under 1MB
        if (!successBuffer) {
          throw new Error('Failed to create any buffer');
        }
        
        console.log(`Final buffer size: ${Math.round(successBuffer.length / 1024)}KB`);
        
        if (successBuffer.length > MAX_STICKER_BYTES) {
          console.log('⚠️ Still too large, would convert to static sticker as fallback');
        } else {
          console.log(`✓ Successfully compressed to ${Math.round(successBuffer.length / 1024)}KB (under 1MB limit)`);
        }
        
        // Test assertion: We should be able to get under 1MB with dimension reduction
        if (successBuffer.length > MAX_STICKER_BYTES) {
          throw new Error(`Expected buffer to be under 1MB but got ${Math.round(successBuffer.length / 1024)}KB`);
        }
        
      } finally {
        // Clean up
        try { fs.unlinkSync(largeGifPath); } catch {}
      }
    }
  },
  
  {
    name: 'Medium GIF should be handled with quality reduction only',
    fn: async () => {
      // Create a medium GIF (400x400) that should work with quality reduction
      const mediumGifPath = await createTestGif(400, 400, 'medium-gif-test');
      
      try {
        const gifSharp = sharp(mediumGifPath, { animated: true });
        const metadata = await gifSharp.metadata();
        const { width, height } = metadata;
        
        console.log(`Medium GIF size: ${width}x${height}`);
        
        // Try quality reduction
        const qualityLevels = [85, 75, 65];
        let successBuffer = null;
        
        for (const quality of qualityLevels) {
          try {
            const candidate = await gifSharp
              .clone()
              .webp({ 
                loop: 0,
                effort: 6,
                quality,
                lossless: false
              })
              .toBuffer();
            
            if (candidate.length <= MAX_STICKER_BYTES) {
              successBuffer = candidate;
              console.log(`✓ Quality ${quality} worked: ${Math.round(candidate.length / 1024)}KB`);
              break;
            }
          } catch (err) {
            console.warn(`Quality ${quality} failed:`, err.message);
          }
        }
        
        if (!successBuffer) {
          throw new Error('Failed to compress medium GIF');
        }
        
        console.log(`✓ Medium GIF compressed successfully to ${Math.round(successBuffer.length / 1024)}KB`);
        
      } finally {
        try { fs.unlinkSync(mediumGifPath); } catch {}
      }
    }
  },
  
  {
    name: 'Dimension reduction should maintain aspect ratio',
    fn: async () => {
      // Create a non-square GIF (800x400)
      const wideGifPath = await createTestGif(800, 400, 'wide-gif-test');
      
      try {
        const originalMeta = await sharp(wideGifPath).metadata();
        console.log(`Original dimensions: ${originalMeta.width}x${originalMeta.height}`);
        
        // Resize to 400px max dimension
        const resizedBuffer = await sharp(wideGifPath)
          .resize(400, 400, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: 85 })
          .toBuffer();
        
        const resizedMeta = await sharp(resizedBuffer).metadata();
        console.log(`Resized dimensions: ${resizedMeta.width}x${resizedMeta.height}`);
        
        // Verify aspect ratio is maintained (800:400 = 2:1)
        const originalRatio = originalMeta.width / originalMeta.height;
        const resizedRatio = resizedMeta.width / resizedMeta.height;
        const ratioDiff = Math.abs(originalRatio - resizedRatio);
        
        console.log(`Aspect ratio preserved: ${ratioDiff < 0.01 ? '✓' : '✗'} (diff: ${ratioDiff.toFixed(4)})`);
        
        if (ratioDiff >= 0.01) {
          throw new Error(`Aspect ratio not preserved: original=${originalRatio.toFixed(2)}, resized=${resizedRatio.toFixed(2)}`);
        }
        
      } finally {
        try { fs.unlinkSync(wideGifPath); } catch {}
      }
    }
  }
];

module.exports = { tests };
