// ===== CHAT MODULE =====
// Handles chat interface and message processing

const BACKEND_URL = 'http://localhost:3000';

// DOM Elements
let chatMessagesContainer;
let chatInput;
let sendBtn;

// Initialize chat UI
function initChatUI() {
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
  scrollToBottom();
}

// Add system message to chat
function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message system';
  msgDiv.textContent = text;
  chatMessagesContainer.appendChild(msgDiv);
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

    // Fetch revisions if not already loaded
    const revisionHistory = getRevisionHistory();
    if (!revisionHistory) {
      const success = await fetchFileMetadata();
      if (!success || !getRevisionHistory()) {
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
        revisions: getRevisionHistory(),
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
