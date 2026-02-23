let activeFile = null;

chrome.storage.local.get(["activeFile"], (data) => {
  if (data.activeFile) {
    activeFile = data.activeFile;
    document.getElementById("docTitle").innerText = activeFile.title;
    document.getElementById("fileType").innerText = activeFile.type;
  }
});

document.getElementById("loginBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "AUTH" }, (res) => {
    if (res?.success) {
      console.log("Connected to Google.");
    }
  });
});

document.getElementById("analyzeBtn").addEventListener("click", () => {
  if (!activeFile) {
    alert("No active file detected");
    return;
  }

  chrome.runtime.sendMessage(
    { action: "FETCH_DATA", fileId: activeFile.id },
    (res) => {
      if (!res) return;

      const meta = res.meta;
      const revisions = res.revisions;

      document.getElementById("owner").innerText =
        meta.owners?.[0]?.displayName || "Unknown";

      document.getElementById("modified").innerText =
        new Date(meta.modifiedTime).toLocaleString();

      document.getElementById("revisions").innerText =
        revisions.revisions?.length || 0;

      // Populate version dropdown with actual revisions
      populateAISummaryVersions(revisions);
    }
  );
});

// ===== AI SUMMARY SECTION (NEW - Isolated) =====
const BACKEND_URL = 'http://localhost:3000'; // Change to Render URL later

// AI Summary DOM Elements
const aiSummaryElements = {
  versionSelect: document.getElementById('version-select'),
  summarizeBtn: document.getElementById('summarize-btn'),
  loadingDiv: document.getElementById('loading'),
  summaryContainer: document.getElementById('summary-container'),
  summaryContent: document.getElementById('summary-content'),
  copySummaryBtn: document.getElementById('copy-summary-btn'),
  closeSummaryBtn: document.getElementById('close-summary-btn'),
  errorContainer: document.getElementById('error-container'),
  errorText: document.getElementById('error-container')?.querySelector('.error-text'),
};

// Populate AI Summary versions from actual document revisions
function populateAISummaryVersions(revisions) {
  if (!aiSummaryElements.versionSelect) return; // Skip if element doesn't exist
  
  // Clear existing options except the placeholder
  while (aiSummaryElements.versionSelect.options.length > 1) {
    aiSummaryElements.versionSelect.remove(1);
  }
  
  if (!revisions || !revisions.revisions || revisions.revisions.length === 0) {
    return;
  }
  
  // Add each revision as an option
  revisions.revisions.forEach(revision => {
    const option = document.createElement('option');
    option.value = revision.id;
    option.textContent = `${new Date(revision.modifiedTime).toLocaleString()} - ${revision.lastModifyingUser?.displayName || 'Unknown'}`;
    option.dataset.revisionId = revision.id;
    aiSummaryElements.versionSelect.appendChild(option);
  });
}

// AI Summary helper functions
function showAISummaryLoading() {
  aiSummaryElements.loadingDiv.classList.remove('hidden');
  aiSummaryElements.summaryContainer.classList.add('hidden');
  aiSummaryElements.errorContainer.classList.add('hidden');
}

function showAISummary(summary) {
  aiSummaryElements.loadingDiv.classList.add('hidden');
  aiSummaryElements.errorContainer.classList.add('hidden');
  aiSummaryElements.summaryContainer.classList.remove('hidden');
  aiSummaryElements.summaryContent.textContent = summary;
}

function showAISummaryError(message) {
  aiSummaryElements.loadingDiv.classList.add('hidden');
  aiSummaryElements.summaryContainer.classList.add('hidden');
  aiSummaryElements.errorContainer.classList.remove('hidden');
  if (aiSummaryElements.errorText) {
    aiSummaryElements.errorText.textContent = `⚠️ ${message}`;
  }
}

// AI Summary event listeners
if (aiSummaryElements.versionSelect) {
  aiSummaryElements.versionSelect.addEventListener('change', () => {
    aiSummaryElements.summarizeBtn.disabled = !aiSummaryElements.versionSelect.value;
  });

  aiSummaryElements.summarizeBtn.addEventListener('click', async () => {
    if (!activeFile) {
      showAISummaryError('No active file detected');
      return;
    }

    const selectedRevisionId = aiSummaryElements.versionSelect.value;
    if (!selectedRevisionId) {
      showAISummaryError('Please select a version');
      return;
    }

    showAISummaryLoading();

    try {
      // Fetch the content of the selected revision
      chrome.runtime.sendMessage(
        { action: "FETCH_REVISION_CONTENT", fileId: activeFile.id, revisionId: selectedRevisionId },
        async (res) => {
          if (!res || !res.content) {
            showAISummaryError('Failed to fetch revision content');
            return;
          }

          try {
            const response = await fetch(`${BACKEND_URL}/summarize`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: res.content,
                type: activeFile.type || 'document'
              }),
            });

            if (!response.ok) {
              throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.summary) {
              showAISummary(data.summary);
            } else {
              showAISummaryError('Failed to generate summary');
            }
          } catch (error) {
            console.error('Summarization error:', error);
            showAISummaryError(`Failed to connect to backend. Make sure it's running on ${BACKEND_URL}`);
          }
        }
      );
    } catch (error) {
      console.error('Error:', error);
      showAISummaryError('An error occurred while processing your request');
    }
  });

  aiSummaryElements.copySummaryBtn.addEventListener('click', () => {
    const text = aiSummaryElements.summaryContent.textContent;
    navigator.clipboard.writeText(text).then(() => {
      aiSummaryElements.copySummaryBtn.textContent = 'Copied!';
      setTimeout(() => {
        aiSummaryElements.copySummaryBtn.textContent = 'Copy Summary';
      }, 2000);
    });
  });

  aiSummaryElements.closeSummaryBtn.addEventListener('click', () => {
    aiSummaryElements.summaryContainer.classList.add('hidden');
    aiSummaryElements.versionSelect.value = '';
    aiSummaryElements.summarizeBtn.disabled = true;
  });
}

// ===== END AI SUMMARY SECTION =====
