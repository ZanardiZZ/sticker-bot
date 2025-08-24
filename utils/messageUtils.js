/**
 * Utility functions for formatting messages and sending media
 */

/**
 * Clean description and tags by removing AI-generated placeholders
 * @param {string} description 
 * @param {Array} tags 
 * @returns {object} {description, tags}
 */
function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível', 
    'sem descrição',
    'audio salvo sem descrição ai'
  ];
  
  let cleanDesc = description ? description.toLowerCase() : '';
  if (badPhrases.some(phrase => cleanDesc.includes(phrase))) {
    cleanDesc = '';
  } else {
    cleanDesc = description;
  }

  let cleanTags = [];
  if (tags && Array.isArray(tags)) {
    cleanTags = tags.filter(t => {
      if (!t) return false;
      if (t.includes('##')) return false;
      const low = t.toLowerCase();
      if (badPhrases.some(phrase => low.includes(phrase))) return false;
      return true;
    });
  } else if (typeof tags === 'string') {
    cleanTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  return { description: cleanDesc, tags: cleanTags };
}

/**
 * Render info message for media with description, tags and ID
 * @param {object} param0 {description, tags, id}
 * @returns {string}
 */
function renderInfoMessage({ description, tags, id }) {
  const tagsLine = (tags && tags.length)
    ? tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
    : '';
  return [
    '📝 ' + (description || ''),
    '🏷️ ' + tagsLine,
    '🆔 ' + id,
  ].join('\n');
}

module.exports = {
  cleanDescriptionTags,
  renderInfoMessage
};