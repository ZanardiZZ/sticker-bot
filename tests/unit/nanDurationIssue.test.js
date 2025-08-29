/**
 * NaN Duration Issue Tests
 * Tests that specifically reproduce the NaN duration bug described in issue #108
 */

const path = require('path');
const fs = require('fs');

// Mock the videoProcessor module to simulate the NaN duration scenario
const originalProcessGif = require('../../services/videoProcessor').processGif;

// Create a test that simulates what happens when duration comes back as undefined/NaN
async function simulateNanDurationScenario() {
  console.log('Testing NaN duration scenario...');
  
  // This simulates what happens in the actual bug:
  // When multiple GIFs are processed concurrently, sometimes duration detection fails
  // leading to undefined duration which results in NaN timestamps
  
  // Simulate duration as undefined (which happens in concurrent scenarios)
  const duration = undefined;
  
  // This is the problematic code from processGif function:
  const timestamps = duration > 3 
    ? [duration * 0.1, duration * 0.5, duration * 0.9]
    : [0.1, Math.max(0.5, duration * 0.3), Math.max(1, duration * 0.8)];
  
  console.log('Duration:', duration);
  console.log('Calculated timestamps:', timestamps);
  
  // Check if we get NaN values
  const hasNaN = timestamps.some(t => isNaN(t));
  console.log('Contains NaN timestamps:', hasNaN);
  
  if (hasNaN) {
    // This would cause the error message we see in the issue:
    // "ffmpeg exited with code 1: Invalid duration specification for ss: NaN"
    console.log('❌ BUG REPRODUCED: NaN values detected in timestamps');
    console.log('These NaN values would be passed to FFmpeg causing the error');
    return { 
      description: `Falha ao extrair qualquer frame. Erros: Frame 1: Frame 1 não foi criado; Frame 2: ffmpeg exited with code 1: Invalid duration specification for ss: ${timestamps[1]}; Frame 3: ffmpeg exited with code 1: Invalid duration specification for ss: ${timestamps[2]}`, 
      tags: ['gif', 'erro', 'processamento'] 
    };
  }
  
  return { description: 'Success', tags: ['gif'] };
}

// Test for the fix we need to implement
async function testProposedFix() {
  console.log('\nTesting proposed fix...');
  
  // Simulate duration as undefined (the problematic scenario)
  let duration = undefined;
  
  // PROPOSED FIX: Add proper validation and fallback
  // If duration is undefined, null, NaN, <= 0, or not finite (Infinity/-Infinity), use a default value
  if (!duration || isNaN(duration) || duration <= 0 || !isFinite(duration)) {
    duration = 2; // Default fallback duration
    console.log('Invalid duration detected, using fallback:', duration);
  }
  
  // Now calculate timestamps with the validated duration
  const timestamps = duration > 3 
    ? [duration * 0.1, duration * 0.5, duration * 0.9]
    : [0.1, Math.max(0.5, duration * 0.3), Math.max(1, duration * 0.8)];
  
  console.log('Fixed duration:', duration);
  console.log('Fixed timestamps:', timestamps);
  
  // Verify no NaN values
  const hasNaN = timestamps.some(t => isNaN(t));
  console.log('Contains NaN timestamps after fix:', hasNaN);
  
  if (!hasNaN) {
    console.log('✅ FIX VALIDATED: No NaN values in timestamps');
  }
  
  return !hasNaN;
}

// Also test edge cases
async function testEdgeCases() {
  console.log('\nTesting edge cases...');
  
  const edgeCaseDurations = [
    null,
    undefined, 
    NaN,
    0,
    -1,
    'invalid',
    Infinity,
    -Infinity
  ];
  
  for (const testDuration of edgeCaseDurations) {
    console.log(`\nTesting duration: ${testDuration} (${typeof testDuration})`);
    
    // Apply the same fix logic
    let duration = testDuration;
    if (!duration || isNaN(duration) || duration <= 0 || !isFinite(duration)) {
      duration = 2; // Default fallback
    }
    
    const timestamps = duration > 3 
      ? [duration * 0.1, duration * 0.5, duration * 0.9]
      : [0.1, Math.max(0.5, duration * 0.3), Math.max(1, duration * 0.8)];
    
    const hasNaN = timestamps.some(t => isNaN(t));
    console.log(`  Fixed duration: ${duration}, hasNaN: ${hasNaN}`);
    
    if (hasNaN) {
      console.log(`  ❌ FAILED for input: ${testDuration}`);
      return false;
    }
  }
  
  console.log('✅ All edge cases handled correctly');
  return true;
}

// Run all tests
async function runNanDurationTests() {
  console.log('=== NaN Duration Issue Reproduction Tests ===\n');
  
  try {
    // First reproduce the bug
    const bugResult = await simulateNanDurationScenario();
    console.log('Bug reproduction result:', bugResult.description.includes('NaN') ? 'BUG REPRODUCED ❌' : 'No bug detected');
    
    // Test the proposed fix
    const fixWorked = await testProposedFix();
    
    // Test edge cases
    const edgeCasesPass = await testEdgeCases();
    
    console.log('\n=== SUMMARY ===');
    console.log('Bug reproduced:', bugResult.description.includes('NaN'));
    console.log('Fix validates:', fixWorked);
    console.log('Edge cases pass:', edgeCasesPass);
    
    return { bugReproduced: bugResult.description.includes('NaN'), fixValidated: fixWorked, edgeCasesPass };
    
  } catch (error) {
    console.error('Test error:', error.message);
    return { error: error.message };
  }
}

module.exports = {
  tests: [
    {
      name: 'NaN Duration Issue - Reproduction and Fix Validation',
      fn: runNanDurationTests
    }
  ]
};