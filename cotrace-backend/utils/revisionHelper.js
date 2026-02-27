// # utility functions for processing and formatting revision data

/**
 * # prepare revision data for ai analysis and processing
 * @param {Object} revisions - revision history object containing revision array
 * @returns {string} formatted revision summary for ai consumption
 * @description formats google docs revision history into a readable summary
 *              limits to last 50 revisions to prevent exceeding token limits
 */
function prepareRevisionSummary(revisions) {
  // # validate that revisions data exists and contains revision array
  if (!revisions || !revisions.revisions || revisions.revisions.length === 0) {
    return "no revision history available.";
  }

  // # map revisions to formatted strings with metadata
  const revisionList = revisions.revisions
    .slice(0, 50) // # limit to most recent 50 revisions for token efficiency
    .map((rev, index) => {
      // # convert timestamp to human-readable local time format
      const date = new Date(rev.modifiedTime).toLocaleString();
      
      // # extract author name with fallback for missing data
      const author = rev.lastModifyingUser?.displayName || "unknown";
      
      // # return formatted revision entry with index, date, author, and revision id
      return `${index + 1}. ${date} - last modified by: ${author} (revision id: ${rev.id})`;
    })
    .join("\n");

  // # return formatted summary with total count and revision list
  return `total revisions: ${revisions.revisions.length}\n\nrevision history (most recent first):\n${revisionList}`;
}

module.exports = {
  prepareRevisionSummary
};
