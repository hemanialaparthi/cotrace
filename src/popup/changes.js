// ===== CHANGES MODULE =====
// Handles the changes tab - comparing versions and showing diffs with AI analysis
// Note: BACKEND_URL is defined in chat.js and shared globally

// DOM Elements
let versionSelects = [];
let analyzeBtn;
let diffOutput;

// Initialize changes tab
function initChangesTab() {
  versionSelects = document.querySelectorAll('.version-select');
  analyzeBtn = document.querySelector('.analyze-btn');
  diffOutput = document.querySelector('.diff-output');

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', handleAnalyzeClick);
  }

  // Fetch metadata and populate version selects
  // Show loading message while fetching
  diffOutput.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--text-muted);">
      <span class="spinner"></span>
      <span>Loading versions...</span>
    </div>
  `;

  // Fetch file metadata asynchronously
  fetchFileMetadata().then(() => {
    console.log('[CHANGES] Metadata fetched, populating version selects');
    populateVersionSelects();
  }).catch(error => {
    console.error('[CHANGES] Failed to fetch metadata:', error);
    diffOutput.innerHTML = `
      <div style="padding: 12px; background: #FFEBEE; border-radius: var(--radius-sm); border-left: 4px solid #FF6B6B; color: #C62828; font-size: 12px;">
        Failed to load versions. Please try again or use the Chat tab first to load the document.
      </div>
    `;
  });
}

// Populate version dropdown selects with revision options
function populateVersionSelects() {
  const revisionHistory = getRevisionHistory();
  
  if (!revisionHistory || !revisionHistory.revisions || revisionHistory.revisions.length === 0) {
    console.warn('[CHANGES] No revision history available');
    versionSelects.forEach(select => {
      select.innerHTML = '<option value="" disabled selected>No versions available</option>';
    });
    return;
  }

  const revisions = revisionHistory.revisions;
  console.log(`[CHANGES] Populating ${revisions.length} revisions into version selects`);

  // Create options for each revision
  const optionsHtml = revisions.map((revision, index) => {
    const date = new Date(revision.modifiedTime);
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const author = revision.lastModifyingUser?.displayName || 'Unknown';
    const label = `v${index + 1} - ${dateStr} (${author})`;
    return `<option value="${revision.id}">${label}</option>`;
  }).join('');

  versionSelects.forEach((select, idx) => {
    select.innerHTML = `<option value="" disabled selected>Select version ${idx + 1}</option>${optionsHtml}`;
  });
}

// Handle analyze button click
async function handleAnalyzeClick() {
  const version1Id = versionSelects[0]?.value;
  const version2Id = versionSelects[1]?.value;

  if (!version1Id || !version2Id) {
    showError('Please select two different versions to compare');
    return;
  }

  if (version1Id === version2Id) {
    showError('Please select two different versions');
    return;
  }

  const activeFile = getActiveFile();
  if (!activeFile) {
    showError('No active file detected');
    return;
  }

  // Disable button and show loading state
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  
  showLoading();

  try {
    // Get auth token
    const authTokenData = await chrome.storage.local.get('authToken');
    if (!authTokenData.authToken) {
      showError('Authentication token not found. Please sign in again.');
      return;
    }

    // Get revision history for version names
    const revisionHistory = getRevisionHistory();
    const versions = revisionHistory.revisions;
    const version1 = versions.find(v => v.id === version1Id);
    const version2 = versions.find(v => v.id === version2Id);

    // Call backend to compare versions
    const response = await fetch(`${BACKEND_URL}/compare-versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId: activeFile.id,
        fileTitle: activeFile.title,
        revisions: revisionHistory,
        version1Id: version1Id,
        version2Id: version2Id,
        authToken: authTokenData.authToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      displayDiffResults(data, version1, version2);
    } else {
      showError(data.error || 'Failed to analyze changes');
    }
  } catch (error) {
    console.error('[CHANGES] Error:', error);
    showError(`Failed to analyze changes: ${error.message}`);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze';
  }
}

// Display diff results in the output area
function displayDiffResults(data, version1, version2) {
  const { diff, stats, summary } = data;

  let html = '';

  // Version info header
  html += '<div style="padding: 12px; background: var(--panel); border-radius: var(--radius-sm); margin-bottom: 12px; border-left: 4px solid var(--active);">';
  html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;">';
  
  // Version 1 info
  const date1 = new Date(version1.modifiedTime).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  html += `<div><strong>Earlier Version:</strong><br/>Date: ${date1}<br/>Author: ${version1.lastModifyingUser?.displayName || 'Unknown'}</div>`;
  
  // Version 2 info
  const date2 = new Date(version2.modifiedTime).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  html += `<div><strong>Latest Version:</strong><br/>Date: ${date2}<br/>Author: ${version2.lastModifyingUser?.displayName || 'Unknown'}</div>`;
  
  html += '</div></div>';

  // Change statistics (compact)
  html += '<div style="padding: 12px; background: var(--input-bg); border-radius: var(--radius-sm); margin-bottom: 12px;">';
  html += '<div style="font-weight: 600; margin-bottom: 8px; color: var(--text);">Change Summary</div>';
  html += '<div style="display: flex; gap: 12px; font-size: 13px;">';
  html += `<div><span style="color: #4CAF50; font-weight: 600;">+${stats.additions}</span> additions</div>`;
  html += `<div><span style="color: #FF6B6B; font-weight: 600;">-${stats.deletions}</span> deletions</div>`;
  html += `<div><span style="color: var(--text-muted);">${stats.totalChanges}</span> total changes</div>`;
  html += '</div></div>';

  // AI Summary (primary focus)
  if (summary) {
    html += '<div style="padding: 12px; background: var(--input-bg); border-radius: var(--radius-sm); border-left: 4px solid #2196F3;">';
    html += '<div style="font-weight: 600; margin-bottom: 8px; color: var(--text);">What Changed</div>';
    html += '<div style="font-size: 13px; color: var(--text); line-height: 1.6;">';
    html += marked.parse(summary);
    html += '</div></div>';
  }

  diffOutput.innerHTML = html;
  
  // Scroll to results
  diffOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Show loading state
function showLoading() {
  diffOutput.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: var(--text-muted);">
      <span class="spinner"></span>
      <span>Analyzing changes...</span>
    </div>
  `;
}

// Show error message
function showError(message) {
  diffOutput.innerHTML = `
    <div style="padding: 12px; background: #FFEBEE; border-radius: var(--radius-sm); border-left: 4px solid #FF6B6B; color: #C62828; font-size: 12px;">
      ${escapeHtml(message)}
    </div>
  `;
}

// Utility function to escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
