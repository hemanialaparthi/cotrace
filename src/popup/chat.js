// ===== CHAT MODULE =====
// Handles chat interface and message processing

const BACKEND_URL = 'http://localhost:3000';

// DOM Elements
let chatMessagesContainer;
let chatInput;
let sendBtn;

// Initialize chat UI
async function initChatUI() {
  chatMessagesContainer = document.querySelector('.chat-messages');
  chatInput = document.querySelector('.chat-input');
  sendBtn = document.querySelector('.send-btn');

  // Add event listeners
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }
  
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Add dynamic styles for chat messages
  addChatStyles();

  // Load previous chat history for this file
  const hadPreviousChat = await loadChatHistory();
  return hadPreviousChat;
}

// Send a message
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

// Add user message to chat
function addUserMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message user';
  msgDiv.textContent = text;
  chatMessagesContainer.appendChild(msgDiv);
  saveChatMessage('user', text).catch(err => console.error('[CHAT] Error saving user message:', err));
  scrollToBottom();
}

// Add system message to chat
function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message system';
  msgDiv.innerHTML = marked.parse(text);
  chatMessagesContainer.appendChild(msgDiv);
  saveChatMessage('system', text).catch(err => console.error('[CHAT] Error saving system message:', err));
  scrollToBottom();
}

// Add loading message
function addLoadingMessage() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message loading';
  msgDiv.id = 'loading-msg';
  msgDiv.innerHTML = '<span class="spinner"></span> Processing...';
  chatMessagesContainer.appendChild(msgDiv);
  scrollToBottom();
}

// Remove loading message
function removeLoadingMessage() {
  const loadingMsg = document.getElementById('loading-msg');
  if (loadingMsg) loadingMsg.remove();
}

// Scroll chat to bottom
function scrollToBottom() {
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// Process user query
async function processQuery(query) {
  try {
    const activeFile = getActiveFile();
    if (!activeFile) {
      removeLoadingMessage();
      addSystemMessage('Error: No active file detected. Please open a document first.');
      return;
    }

    // Always fetch fresh revisions to get latest changes
    const success = await fetchFileMetadata();
    const revisionHistory = getRevisionHistory();
    if (!success || !revisionHistory) {
      removeLoadingMessage();
      addSystemMessage('Error: Could not load revision history. Please authenticate first by clicking the account button.');
      return;
    }

    console.log(`[CHAT] Found ${revisionHistory.revisions?.length || 0} revisions to analyze`);

    // Get auth token from storage
    const authTokenData = await chrome.storage.local.get('authToken');
    if (!authTokenData.authToken) {
      removeLoadingMessage();
      addSystemMessage('Error: Authentication token not found. Please sign in again.');
      return;
    }

    // Prepare request payload
    const requestPayload = {
      query: query,
      fileId: activeFile.id,
      fileTitle: activeFile.title,
      fileType: activeFile.type,
      revisions: getRevisionHistory(),
      authToken: authTokenData.authToken,
    };
    
    console.log(`[CHAT] Sending request with ${requestPayload.revisions?.revisions?.length || 0} revisions to backend`);

    // Send query to backend for AI analysis
    const response = await fetch(`${BACKEND_URL}/query-changes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
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

// Add dynamic styles for chat messages
function addChatStyles() {
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
}

// Generate storage key for chat history based on active file
function getChatStorageKey() {
  const activeFile = getActiveFile();
  if (!activeFile || !activeFile.id) {
    return 'chat-history-default';
  }
  return `chat-history-${activeFile.id}`;
}

// Load chat history from storage
async function loadChatHistory() {
  try {
    const storageKey = getChatStorageKey();
    const data = await chrome.storage.local.get(storageKey);
    const messages = data[storageKey] || [];
    
    // Clear existing messages
    chatMessagesContainer.innerHTML = '';
    
    // Restore messages from storage
    messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `chat-message ${msg.type}`;
      
      if (msg.type === 'system') {
        msgDiv.innerHTML = marked.parse(msg.text);
      } else {
        msgDiv.textContent = msg.text;
      }
      
      chatMessagesContainer.appendChild(msgDiv);
    });
    
    scrollToBottom();
    console.log(`[CHAT] Loaded ${messages.length} messages from storage`);
    
    // Return true if messages were loaded from storage
    return messages.length > 0;
  } catch (error) {
    console.error('[CHAT] Error loading history:', error);
    return false;
  }
}

// Save chat message to storage
async function saveChatMessage(type, text) {
  try {
    const storageKey = getChatStorageKey();
    const data = await chrome.storage.local.get(storageKey);
    const messages = data[storageKey] || [];
    
    // Add new message
    messages.push({ type, text });
    
    // Save back to storage
    await chrome.storage.local.set({ [storageKey]: messages });
    console.log(`[CHAT] Saved message to storage (total: ${messages.length})`);
  } catch (error) {
    console.error('[CHAT] Error saving message:', error);
  }
}

// Clear chat history for current file
async function clearChatHistory() {
  try {
    const storageKey = getChatStorageKey();
    await chrome.storage.local.remove(storageKey);
    chatMessagesContainer.innerHTML = '';
    console.log('[CHAT] Chat history cleared');
  } catch (error) {
    console.error('[CHAT] Error clearing history:', error);
  }
}
