/**
 * Unit tests for context-aware tag similarity logic improvements
 * Tests the enhanced fix for issue #88 - intelligent synonym matching
 */

// Mock implementations for testing without database dependencies

// Mock the expandTagsWithSynonyms function
async function expandTagsWithSynonyms(tags) {
  const synonymMap = {
    'humor': ['humor', 'comedy', 'funny', 'comic'],
    'ambiente': ['ambiente', 'environment', 'setting', 'ambiance'],
    'animal': ['animal', 'beast', 'creature', 'pet']
  };
  
  const expandedSet = new Set();
  
  for (const tag of tags) {
    const trimmedTag = tag.trim().toLowerCase();
    if (!trimmedTag) continue;
    
    expandedSet.add(trimmedTag);
    
    // Add synonyms if available
    const synonyms = synonymMap[trimmedTag] || [];
    synonyms.forEach(s => expandedSet.add(s.toLowerCase()));
  }
  
  return Array.from(expandedSet);
}

// Mock database with test tags
const mockTags = [
  { id: 1, name: 'Humor' },
  { id: 2, name: 'HumorCanino' }, 
  { id: 3, name: 'HumorInfantil' },
  { id: 4, name: 'HumorNegro' },
  { id: 5, name: 'Animal' },
  { id: 6, name: 'Cachorro' },
  { id: 7, name: 'Gato' },
  { id: 8, name: 'Ambiente' },
  { id: 9, name: 'AmbienteAconchegante' },
  { id: 10, name: 'AmbienteAoArLivre' },
  { id: 11, name: 'AmbienteClínico' },
  { id: 12, name: 'AmbienteDeTrabalho' }
];

// Mock findExactTagMatches function
async function findExactTagMatches(expandedTags) {
  return mockTags.filter(tag => 
    expandedTags.some(expanded => expanded.toLowerCase() === tag.name.toLowerCase())
  );
}

// Mock selectBestTagByContext function
function selectBestTagByContext(originalTag, candidateTags, allContextTags) {
  // If there's an exact match with the original tag, prefer it
  const exactMatch = candidateTags.find(tag => 
    tag.name.toLowerCase() === originalTag.toLowerCase()
  );
  if (exactMatch) {
    return exactMatch;
  }
  
  // Calculate context scores for each candidate
  const tagScores = candidateTags.map(candidateTag => {
    let score = 0;
    const candidateLower = candidateTag.name.toLowerCase();
    
    // Check similarity with other tags in context
    for (const contextTag of allContextTags) {
      if (contextTag === originalTag) continue;
      
      const contextLower = contextTag.toLowerCase();
      
      // Boost for compound tags that share words with context
      // Example: "HumorCanino" gets points if context includes "Cachorro", "Animal"
      if (candidateLower.includes(contextLower) || 
          contextLower.includes(candidateLower.replace(originalTag.toLowerCase(), ''))) {
        score += 10;
      }
      
      // Boost for simple semantic similarity
      const candidateWords = candidateLower.split(/(?=[A-Z])/).map(w => w.toLowerCase());
      const contextWords = contextLower.split(/(?=[A-Z])/).map(w => w.toLowerCase());
      
      for (const cWord of candidateWords) {
        for (const ctxWord of contextWords) {
          if (cWord === ctxWord && cWord.length > 2) {
            score += 5;
          }
        }
      }
    }
    
    // Penalty for overly generic tags when more specific ones exist
    if (candidateTag.name.toLowerCase() === originalTag.toLowerCase() && 
        candidateTags.some(t => t.name.length > candidateTag.name.length)) {
      score -= 2;
    }
    
    return { tag: candidateTag, score };
  });
  
  // Sort by score and return the best
  tagScores.sort((a, b) => b.score - a.score);
  
  return tagScores[0].tag;
}

// Context-aware findSimilarTags implementation
async function findSimilarTagsContextAware(tagCandidates) {
  if (!tagCandidates.length) return [];

  const results = [];
  
  for (const originalTag of tagCandidates) {
    // Expand individual tag with its synonyms
    const expandedTags = await expandTagsWithSynonyms([originalTag]);
    
    // Find exact matches for the original tag and its synonyms
    const exactMatches = await findExactTagMatches(expandedTags);
    
    if (exactMatches.length === 0) {
      // No matches found, skip this tag
      continue;
    } else if (exactMatches.length === 1) {
      // Perfect match, use directly
      results.push(exactMatches[0]);
    } else {
      // Multiple matches - use context to choose the best
      const bestMatch = selectBestTagByContext(originalTag, exactMatches, tagCandidates);
      results.push(bestMatch);
    }
  }
  
  return results;
}

const tests = [
  {
    name: 'Context-aware matching - Animal context should prefer HumorCanino',
    fn: async () => {
      const animalContext = ['Humor', 'Animal', 'Cachorro'];
      const result = await findSimilarTagsContextAware(animalContext);
      const humorMatch = result.find(tag => tag.name.toLowerCase().includes('humor'));
      
      if (humorMatch && humorMatch.name === 'HumorCanino') {
        return { success: true, message: `Smart selection: ${humorMatch.name} based on animal context` };
      } else {
        return { success: false, message: `Expected HumorCanino but got: ${humorMatch?.name || 'none'}` };
      }
    }
  },
  
  {
    name: 'Context-aware matching - Without animal context should prefer exact Humor',
    fn: async () => {
      const noAnimalContext = ['Humor', 'Festa', 'Diversão'];
      const result = await findSimilarTagsContextAware(noAnimalContext);
      const humorMatch = result.find(tag => tag.name.toLowerCase().includes('humor'));
      
      if (humorMatch && humorMatch.name === 'Humor') {
        return { success: true, message: `Correct exact match: ${humorMatch.name} without specific context` };
      } else {
        return { success: false, message: `Expected Humor but got: ${humorMatch?.name || 'none'}` };
      }
    }
  },
  
  {
    name: 'Context-aware matching - Prevents compound tag pollution',
    fn: async () => {
      const environmentContext = ['Ambiente'];
      const result = await findSimilarTagsContextAware(environmentContext);
      const ambienteMatch = result.find(tag => tag.name.toLowerCase().includes('ambiente'));
      
      // Should find exact "Ambiente" match, not compound variants
      if (ambienteMatch && ambienteMatch.name === 'Ambiente') {
        return { success: true, message: `Prevented pollution: found exact ${ambienteMatch.name} instead of compounds` };
      } else {
        return { success: false, message: `Expected Ambiente but got: ${ambienteMatch?.name || 'none'}` };
      }
    }
  },
  
  {
    name: 'Context-aware matching - Multiple context reinforcement',
    fn: async () => {
      const strongAnimalContext = ['Humor', 'Animal', 'Cachorro', 'Pet', 'Canino'];
      const result = await findSimilarTagsContextAware(strongAnimalContext);
      const humorMatch = result.find(tag => tag.name.toLowerCase().includes('humor'));
      
      if (humorMatch && humorMatch.name === 'HumorCanino') {
        return { success: true, message: `Strong context reinforcement selected: ${humorMatch.name}` };
      } else {
        return { success: false, message: `Expected HumorCanino with strong context but got: ${humorMatch?.name || 'none'}` };
      }
    }
  },
  
  {
    name: 'Context-aware matching - Synonym expansion still works',
    fn: async () => {
      const synonymContext = ['Comedy', 'Animal'];  // "Comedy" is synonym of "Humor"
      const expandedTags = await expandTagsWithSynonyms(['Comedy']);
      
      // Should expand "Comedy" to include "Humor" and find matches
      if (expandedTags.includes('humor') && expandedTags.includes('comedy')) {
        return { success: true, message: `Synonym expansion working: ${expandedTags.join(', ')}` };
      } else {
        return { success: false, message: `Synonym expansion failed: ${expandedTags.join(', ')}` };
      }
    }
  }
];

function cleanup() {
  // No cleanup needed for mock tests
}

module.exports = {
  name: 'Context-Aware Tag Similarity Tests',
  tests,
  cleanup
};