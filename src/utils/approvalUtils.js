/**
 * Approval system utilities
 */

const { isOriginalSender } = require('../database/models/pendingEdits');

/**
 * Checks if a user can edit media directly without approval
 * @param {object} user - User object with role property
 * @param {number} mediaId - Media ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user can edit directly
 */
async function canEditDirectly(user, mediaId, userId) {
  // Admins can always edit directly
  if (user.role === 'admin') {
    return true;
  }
  
  // Original senders can edit their own media directly
  return await isOriginalSender(mediaId, userId);
}

/**
 * Checks if enough votes exist to approve an edit (3 approve votes)
 * @param {object} voteCounts - Vote counts {approve: number, reject: number}
 * @returns {boolean} True if enough votes to approve
 */
function hasEnoughVotesToApprove(voteCounts) {
  return voteCounts.approve >= 3;
}

/**
 * Checks if enough votes exist to reject an edit (3 reject votes)
 * @param {object} voteCounts - Vote counts {approve: number, reject: number}
 * @returns {boolean} True if enough votes to reject
 */
function hasEnoughVotesToReject(voteCounts) {
  return voteCounts.reject >= 3;
}

module.exports = {
  canEditDirectly,
  hasEnoughVotesToApprove,
  hasEnoughVotesToReject
};
