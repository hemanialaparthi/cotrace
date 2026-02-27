// ===== POPUP2 - CHAT-BASED INTERFACE =====

const BACKEND_URL = 'http://localhost:3000';
let activeFile = null;
let fileMetadata = null;
let revisionHistory = null;

// DOM Elements
const chatMessagesContainer = document.querySelector('.chat-messages');
const chatInput = document.querySelector('.chat-input');
const sendBtn = document.querySelector('.send-btn');
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadActiveFile();
  });
} else {
  // DOM is already loaded
  initializeEventListeners();
  loadActiveFile();
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
  // Account button
  const accountBtn = document.querySelector('.icon-btn');
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      addSystemMessage('Authenticating with Google...');
      chrome.runtime.sendMessage({ action: 'AUTH' }, (res) => {
        if (chrome.runtime.lastError) {
          addSystemMessage('Authentication failed: ' + chrome.runtime.lastError.message);
        } else if (res?.success) {
          addSystemMessage('✓ Successfully authenticated! Now you can ask questions about your document changes.');
        } else {
          addSystemMessage('Authentication failed: ' + (res?.error || 'Unknown error'));
        }
      });
    });
  }

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const targetId = e.currentTarget.dataset.target;
      switchTab(targetId, e.currentTarget);
    });
  });

  // Chat input
  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function switchTab(targetId, tabElement) {
  // Update tab active state
  tabs.forEach(tab => tab.classList.remove('active'));
  if (tabElement) {
    tabElement.classList.add('active');
  }

  // Update view visibility
  views.forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(targetId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Handle contributions tab - populate it with data
  if (targetId === 'view-contribution') {
    const contribList = document.getElementById('contrib-list');
    
    if (!activeFile) {
      if (contribList) {
        contribList.innerHTML = '<p style="color: var(--text-muted); padding: 12px; text-align: center;">No document detected. Please open a Google Doc, Sheet, or Slide.</p>';
      }
      return;
    }
    
    if (!revisionHistory) {
      // Show loading state
      console.log('No revision history, fetching...');
      if (contribList) {
        contribList.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted);"><div class="spinner" style="margin: 0 auto 8px; display: inline-block; width: 16px; height: 16px; border: 2px solid var(--text-muted); border-top-color: var(--text); border-radius: 50%; animation: spin 0.6s linear infinite;"></div><p>Loading contributions...</p></div>';
      }
      
      fetchFileMetadata().then(success => {
        console.log('Fetch result:', success, 'revisionHistory:', revisionHistory);
        if (success && revisionHistory) {
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
}

// ===== CHAT FUNCTIONALITY =====
function loadActiveFile() {
  chrome.storage.local.get(['activeFile'], (data) => {
    if (data.activeFile) {
      activeFile = data.activeFile;
      addSystemMessage(`Document loaded: "${activeFile.title}". What would you like to know about the changes?`);
      // Optionally pre-fetch file metadata for faster queries
      if (!revisionHistory) {
        // Don't auto-fetch, let user trigger it by sending a message
      }
    } else {
      addSystemMessage('No document detected. Please open a Google Doc, Sheet, or Slide to use CoTrace.');
    }
  });
}

function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  // Clear input
  chatInput.value = '';

  // Add user message to chat
  addUserMessage(message);

  // Show loading indicator
  addLoadingMessage();

  // Process the query
  processQuery(message);
}

function addUserMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message user';
  msgDiv.textContent = text;
  chatMessagesContainer.appendChild(msgDiv);
  scrollToBottom();
}

function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message system';
  msgDiv.textContent = text;
  chatMessagesContainer.appendChild(msgDiv);
  scrollToBottom();
}

function addLoadingMessage() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message loading';
  msgDiv.id = 'loading-msg';
  msgDiv.innerHTML = '<span class="spinner"></span> Processing...';
  chatMessagesContainer.appendChild(msgDiv);
  scrollToBottom();
}

function removeLoadingMessage() {
  const loadingMsg = document.getElementById('loading-msg');
  if (loadingMsg) loadingMsg.remove();
}

function scrollToBottom() {
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// ===== QUERY PROCESSING =====
async function processQuery(query) {
  try {
    if (!activeFile) {
      removeLoadingMessage();
      addSystemMessage('Error: No active file detected. Please open a document first.');
      return;
    }

    // Fetch revisions if not already loaded
    if (!revisionHistory) {
      const success = await fetchFileMetadata();
      if (!success || !revisionHistory) {
        removeLoadingMessage();
        addSystemMessage('Error: Could not load revision history. Please authenticate first by clicking the account button.');
        return;
      }
    }

    // Send query to backend for AI analysis
    const response = await fetch(`${BACKEND_URL}/query-changes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        fileId: activeFile.id,
        fileTitle: activeFile.title,
        fileType: activeFile.type,
        revisions: revisionHistory,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    removeLoadingMessage();

    if (data.success && data.answer) {
      addSystemMessage(data.answer);
    } else {
      addSystemMessage('Unable to process your query. Please try again.');
    }
  } catch (error) {
    console.error('Query error:', error);
    removeLoadingMessage();
    addSystemMessage(`Error: ${error.message}. Make sure the backend is running on ${BACKEND_URL}`);
  }
}

async function fetchFileMetadata() {
  return new Promise((resolve, reject) => {
    if (!activeFile) {
      console.error('No active file');
      resolve(false);
      return;
    }

    chrome.runtime.sendMessage(
      { action: 'FETCH_DATA', fileId: activeFile.id },
      (res) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log('FETCH_DATA response:', res);
        
        if (res && res.meta && res.revisions) {
          fileMetadata = res.meta;
          revisionHistory = res.revisions;
          console.log('Successfully fetched data. Revisions count:', revisionHistory.revisions?.length);
          resolve(true);
        } else {
          console.error('Invalid response format:', res);
          resolve(false);
        }
      }
    );
  });
}

// ===== CONTRIBUTIONS VIEW =====
function populateContributions() {
  const contribList = document.getElementById('contrib-list');
  
  if (!contribList) {
    console.error('contrib-list element not found');
    return;
  }

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

// ===== CHANGES VIEW =====
// The changes tab would show version comparison
// Users can select two versions to compare

// ===== STYLES FOR CHAT MESSAGES =====
// Add dynamic styles for chat messages
const style = document.createElement('style');
style.textContent = `
  .chat-message {
    padding: 12px;
    border-radius: 8px;
    margin: 8px 0;
    font-size: 13px;
    line-height: 1.4;
    word-wrap: break-word;
  }

  .chat-message.user {
    background: var(--active);
    color: var(--active-text);
    margin-left: 20px;
    text-align: right;
  }

  .chat-message.system {
    background: var(--input-bg);
    color: var(--text);
    margin-right: 20px;
  }

  .chat-message.loading {
    background: var(--input-bg);
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 20px;
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--text-muted);
    border-top-color: var(--text);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
