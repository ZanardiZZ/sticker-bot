#!/usr/bin/env node

// Test script to reproduce the tag synonym issue
require('dotenv').config();

const { getSynonyms, expandTagsWithSynonyms } = require('./database/utils/index.js');

async function testSynonymIssue() {
  console.log('=== Testing Tag Synonym Issue ===\n');
  
  // Test the problematic "Ambiente" case
  const testTags = ['AmbienteAconchegante'];
  
  console.log('1. Testing synonym expansion for:', testTags);
  try {
    const expanded = await expandTagsWithSynonyms(testTags);
    console.log('   Expanded tags:', expanded);
  } catch (e) {
    console.log('   Error (expected, no WordNet service):', e.message);
  }
  
  console.log('\n2. Testing getSynonyms directly:');
  try {
    const synonyms = await getSynonyms('ambiente');
    console.log('   Synonyms for "ambiente":', synonyms);
  } catch (e) {
    console.log('   Error (expected, no WordNet service):', e.message);
  }
  
  // Simulate the problem scenario with existing tags
  console.log('\n3. Simulating the current matching logic:');
  const existingTags = [
    'AmbienteAconchegante',
    'AmbienteAoArLivre', 
    'AmbienteClínico',
    'AmbienteDeTrabalho',
    'AmbienteDoméstico',
    'AmbienteEscuro',
    'AmbienteInformal',
    'AmbienteInterno',
    'AmbienteNoturno',
    'AmbienteRústico'
  ];
  
  const newTag = 'AmbienteAconchegante';
  const lowerNewTag = newTag.toLowerCase();
  
  // Current problematic logic from processAndAssociateTags
  const matched = existingTags
    .map(t => t.toLowerCase())
    .filter(n => n.includes(lowerNewTag) || lowerNewTag.includes(n));
    
  console.log(`   New tag: ${newTag}`);
  console.log(`   Matched existing tags: ${matched.length}`);
  console.log('   Matches:', matched);
  
  // Demonstrate the LIKE pattern matching problem
  console.log('\n4. Demonstrating LIKE pattern matching problem:');
  
  // Test with just "ambiente" as might be returned by synonym expansion
  const expandedTags = ['ambiente']; 
  const likePatterns = expandedTags.map(t => `%${t}%`);
  console.log('   LIKE patterns:', likePatterns);
  
  const wouldMatch = existingTags.filter(tag => {
    return likePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
      return regex.test(tag);
    });
  });
  
  console.log('   Tags that would match LIKE patterns:', wouldMatch);
  
  // Also test the current substring logic
  console.log('\n4b. Current substring matching logic:');
  const searchTerm = 'ambiente';
  const substringMatches = existingTags
    .map(t => t.toLowerCase())
    .filter(n => n.includes(searchTerm.toLowerCase()) || searchTerm.toLowerCase().includes(n));
  console.log(`   Tags containing "${searchTerm}":`, substringMatches.length);
  console.log('   Matches:', substringMatches);
  
  console.log('\n5. What should happen:');
  console.log('   Only exact matches or very close semantic matches should be found');
  console.log('   Expected for "AmbienteAconchegante": only itself or very similar variants');
  console.log('   Current result: Too many matches, causing tag pollution');
}

testSynonymIssue().catch(console.error);