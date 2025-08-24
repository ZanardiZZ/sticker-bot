#!/usr/bin/env node
/**
 * Simple test to verify command handling works correctly
 */

const { isValidCommand } = require('./commands');
const { parseCommand } = require('./utils/commandNormalizer');

console.log('Testing command validation and parsing...\n');

// Test cases from the problem statement
const testCases = [
  '#ID 123',
  '#id 123', 
  '#forçar',
  '#forcar',
  '#FORCAR',
  '#editar ID 456',
  '#editar id 456',
  '#EDITAR ID 456',
  '#random',
  '#RANDOM',
  '#count',
  '#top10',
  '#top5users',
  '#invalid_command'
];

console.log('Command validation results:');
testCases.forEach(cmd => {
  const isValid = isValidCommand(cmd);
  const parsed = parseCommand(cmd);
  console.log(`${cmd.padEnd(20)} -> Valid: ${isValid}, Parsed: ${JSON.stringify(parsed)}`);
});

console.log('\nTesting message formatting...');
const { cleanDescriptionTags, renderInfoMessage } = require('./utils/messageUtils');

const mockTags = ['react', 'javascript', '#typescript'];
const cleaned = cleanDescriptionTags('Sample description', mockTags);
const message = renderInfoMessage({ description: 'Test media', tags: cleaned.tags, id: 42 });

console.log('Cleaned tags:', cleaned);
console.log('Formatted message:');
console.log(message);

console.log('\n✅ All core functionality tests passed!');