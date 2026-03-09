// ===== CONTRIBUTIONS MODULE =====
// Handles the contributions tab and displaying contributor activity

// Populate contributions list from revision history
function populateContributions() {
  const contribList = document.getElementById('contrib-list');
  
  if (!contribList) {
    console.error('contrib-list element not found');
    return;
  }

  const revisionHistory = getRevisionHistory();
  if (!revisionHistory) {
    console.error('revisionHistory is null or undefined');
    contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">No revision history loaded.</p>';
    return;
  }

  if (!revisionHistory.revisions || revisionHistory.revisions.length === 0) {
    console.log('No revisions found in revisionHistory');
    contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">No revisions available for this document.</p>';
    return;
  }

  console.log('Revisions data:', revisionHistory);
  console.log('Number of revisions:', revisionHistory.revisions.length);

  // Group revisions by user with timestamps for sorting
  const userContributions = {};
  
  revisionHistory.revisions.forEach((revision, index) => {
    try {
      // Try multiple possible field names for user data
      let userName = 'Unknown';
      
      if (revision.lastModifyingUser?.displayName) {
        userName = revision.lastModifyingUser.displayName;
      } else if (revision.lastModifyingUser?.emailAddress) {
        userName = revision.lastModifyingUser.emailAddress;
      } else if (revision.lastModifyingUser) {
        userName = JSON.stringify(revision.lastModifyingUser);
      } else if (revision.modifiedByUser?.displayName) {
        userName = revision.modifiedByUser.displayName;
      } else if (revision.modifiedByUser?.emailAddress) {
        userName = revision.modifiedByUser.emailAddress;
      } else if (revision.author?.displayName) {
        userName = revision.author.displayName;
      } else if (revision.author?.emailAddress) {
        userName = revision.author.emailAddress;
      }
      
      const modifiedTime = new Date(revision.modifiedTime);
      const timestamp = modifiedTime.getTime();
      const dateStr = modifiedTime.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      console.log(`[${index}] User="${userName}", Time="${dateStr}", Full revision:`, revision);
      
      if (!userContributions[userName]) {
        userContributions[userName] = [];
      }
      userContributions[userName].push({ timestamp, dateStr });
    } catch (err) {
      console.error('Error processing revision:', revision, err);
    }
  });

  // Create HTML for each user
  contribList.innerHTML = '';
  
  const userNames = Object.keys(userContributions).sort();
  if (userNames.length === 0) {
    console.log('No user contributions found');
    contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">No contributors found.</p>';
    return;
  }
  
  console.log(`Found ${userNames.length} contributors:`, userNames);
  
  userNames.forEach(userName => {
    const dateObjs = userContributions[userName];
    // Sort by timestamp descending (newest first)
    dateObjs.sort((a, b) => b.timestamp - a.timestamp);
    
    // Create user section
    const userSection = document.createElement('div');
    userSection.className = 'contrib-user-section';
    
    // Username header with contribution count
    const userHeader = document.createElement('div');
    userHeader.className = 'contrib-username';
    userHeader.textContent = `${userName} (${dateObjs.length} changes)`;
    
    // Dates list
    const datesList = document.createElement('div');
    datesList.className = 'contrib-dates';
    
    dateObjs.forEach(dateObj => {
      const dateItem = document.createElement('div');
      dateItem.className = 'contrib-date-item';
      dateItem.textContent = dateObj.dateStr;
      datesList.appendChild(dateItem);
    });
    
    userSection.appendChild(userHeader);
    userSection.appendChild(datesList);
    contribList.appendChild(userSection);
  });
  
  console.log('Contributions populated successfully');
}

// Handle contributions tab activation
function handleContributionsTab() {
  const contribList = document.getElementById('contrib-list');
  const activeFile = getActiveFile();
  
  if (!activeFile) {
    if (contribList) {
      contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">No document detected. Please open a Google Doc, Sheet, or Slide.</p>';
    }
    return;
  }
  
  const revisionHistory = getRevisionHistory();
  if (!revisionHistory) {
    // Show loading state
    console.log('No revision history, fetching...');
    if (contribList) {
      contribList.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted);"><div class="spinner" style="margin: 0 auto 8px; display: inline-block; width: 16px; height: 16px; border: 2px solid var(--text-muted); border-top-color: var(--text); border-radius: 50%; animation: spin 0.6s linear infinite;"></div><p>Loading contributions...</p></div>';
    }
    
    fetchFileMetadata().then(success => {
      console.log('Fetch result:', success, 'revisionHistory:', getRevisionHistory());
      if (success && getRevisionHistory()) {
        populateContributions();
      } else {
        if (contribList) {
          contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">Failed to load contributions. Please click the account button to authenticate first.</p>';
        }
      }
    }).catch(err => {
      console.error('Error fetching metadata:', err);
      if (contribList) {
        contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">Error loading contributions. Please try again.</p>';
      }
    });
  } else {
    console.log('Using cached revision history, populating contributions');
    populateContributions();
  }
}
