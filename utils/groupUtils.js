/**
 * Utility functions for WhatsApp group operations
 */

/**
 * Gets group name from group ID (placeholder - would be filled by WhatsApp integration)
 * @param {string} groupId - Group ID
 * @returns {string|null} Group name or null
 */
function getGroupName(groupId) {
  // For now, extracts a "friendly" name from the group ID
  if (!groupId || !groupId.includes('@g.us')) {
    return null;
  }
  
  // Remove @g.us and take first characters as temporary name
  const cleanId = groupId.replace('@g.us', '');
  return `Grupo ${cleanId.substring(0, 10)}...`;
}

module.exports = {
  getGroupName
};