// ===== CHAT MODULE =====
// Handles chat interface and message processing

const BACKEND_URL = 'http://localhost:3000';
const METRICS_CSV_KEY = 'latency-metrics-csv';
const METRICS_HEADER = [
  'timestamp_iso',
  'file_id',
  'file_title',
  'file_type',
  'query_chars',
  'revisions_analyzed',
  'revisions_total',
  'diffs_count',
  'content_summary_chars',
  'system_prompt_chars',
  'server_fetch_ms',
  'server_diff_ms',
  'server_ttfb_ms',
  'server_stream_ms',
  'server_total_ms',
  'client_ttfb_ms',
  'client_total_ms'
];

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

// Add streaming system message (for receiving streamed text)
function addStreamingSystemMessage() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message system';
  msgDiv.id = 'streaming-msg';
  msgDiv.innerHTML = '';
  chatMessagesContainer.appendChild(msgDiv);
  scrollToBottom();
  return msgDiv;
}

// Process user query with streaming
async function processQuery(query) {
  try {
    const activeFile = getActiveFile();
    if (!activeFile) {
      addSystemMessage('Error: No active file detected. Please open a document first.');
      return;
    }

    // Always fetch fresh revisions to get latest changes
    const success = await fetchFileMetadata();
    const revisionHistory = getRevisionHistory();
    if (!success || !revisionHistory) {
      addSystemMessage('Error: Could not load revision history. Please authenticate first by clicking the account button.');
      return;
    }

    console.log(`[CHAT] Found ${revisionHistory.revisions?.length || 0} revisions to analyze`);

    // Get auth token from storage
    const authTokenData = await chrome.storage.local.get('authToken');
    if (!authTokenData.authToken) {
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

    const clientTiming = {
      requestStart: performance.now(),
      firstChunkAt: null,
      doneAt: null
    };
    let serverMeta = null;
    let metricsPersisted = false;

    const persistMetricsOnce = () => {
      if (metricsPersisted || clientTiming.doneAt === null) {
        return;
      }
      metricsPersisted = true;
      const row = buildLatencyRow({
        activeFile,
        queryChars: query.length,
        clientTiming,
        serverMeta
      });
      appendLatencyCsvRow(row).catch(err => console.error('[METRICS] Error saving CSV row:', err));
      console.log('[METRICS] Latency row saved:', row);
    };
    
    console.log(`[CHAT] Sending streaming request to backend`);

    // Create streaming message container
    const streamingMessage = addStreamingSystemMessage();
    let fullText = '';

    // Send query to backend for streaming AI analysis
    const response = await fetch(`${BACKEND_URL}/query-changes-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    // Read the streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let charQueue = [];
    let isAnimating = false;

    // Function to animate characters one by one
    async function animateCharacters() {
      if (isAnimating || charQueue.length === 0) return;
      isAnimating = true;

      while (charQueue.length > 0) {
        charQueue.shift();
        streamingMessage.textContent = fullText.substring(0, fullText.length - charQueue.length);
        scrollToBottom();
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms delay per character
      }

      isAnimating = false;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.meta) {
              serverMeta = data.meta;
              if (data.meta.phase === 'done' || data.meta.phase === 'end') {
                persistMetricsOnce();
              }
            }

            if (data.text) {
              // Accumulate text and add characters to queue
              if (clientTiming.firstChunkAt === null) {
                clientTiming.firstChunkAt = performance.now();
              }
              const newChars = data.text.split('');
              fullText += data.text;
              charQueue.push(...newChars);
              await animateCharacters();
            }

            if (data.done) {
              clientTiming.doneAt = performance.now();
              persistMetricsOnce();
              // Make sure all characters are displayed
              streamingMessage.textContent = fullText;
              // Parse markdown now that streaming is complete
              streamingMessage.innerHTML = marked.parse(fullText);
              // Save the complete message to storage
              saveChatMessage('system', fullText).catch(err => console.error('[CHAT] Error saving system message:', err));
              console.log('[CHAT] Streaming complete');
              return;
            }

            if (data.error) {
              streamingMessage.textContent = `Error: ${data.error}`;
              return;
            }
          } catch (e) {
            console.error('Error parsing stream data:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Query error:', error);
    addSystemMessage(`Error: ${error.message}. Make sure the backend is running on ${BACKEND_URL}`);
  }
}

// Keep scrolling as text streams in
function scrollToBottom() {
  if (chatMessagesContainer) {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
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

function buildLatencyRow({ activeFile, queryChars, clientTiming, serverMeta }) {
  const nowIso = new Date().toISOString();
  const durations = serverMeta?.durations || {};
  const sizes = serverMeta?.sizes || {};

  const clientTtfbMs = clientTiming.firstChunkAt !== null
    ? Math.round(clientTiming.firstChunkAt - clientTiming.requestStart)
    : null;
  const clientTotalMs = clientTiming.doneAt !== null
    ? Math.round(clientTiming.doneAt - clientTiming.requestStart)
    : null;

  return {
    timestamp_iso: nowIso,
    file_id: activeFile?.id || '',
    file_title: activeFile?.title || '',
    file_type: activeFile?.type || '',
    query_chars: queryChars ?? '',
    revisions_analyzed: sizes.revisionsAnalyzed ?? '',
    revisions_total: sizes.revisionsTotal ?? '',
    diffs_count: sizes.diffsCount ?? '',
    content_summary_chars: sizes.contentSummaryChars ?? '',
    system_prompt_chars: sizes.systemPromptChars ?? '',
    server_fetch_ms: durations.fetchMs ?? '',
    server_diff_ms: durations.diffMs ?? '',
    server_ttfb_ms: durations.toFirstChunkMs ?? '',
    server_stream_ms: durations.totalStreamMs ?? '',
    server_total_ms: durations.totalMs ?? '',
    client_ttfb_ms: clientTtfbMs ?? '',
    client_total_ms: clientTotalMs ?? ''
  };
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function appendLatencyCsvRow(row) {
  const data = await chrome.storage.local.get(METRICS_CSV_KEY);
  let csv = data[METRICS_CSV_KEY] || '';

  if (!csv) {
    csv = `${METRICS_HEADER.join(',')}\n`;
  }

  const rowLine = METRICS_HEADER
    .map((key) => escapeCsvValue(row[key]))
    .join(',');

  csv += `${rowLine}\n`;
  await chrome.storage.local.set({ [METRICS_CSV_KEY]: csv });
}

async function exportLatencyCsv() {
  const data = await chrome.storage.local.get(METRICS_CSV_KEY);
  const csv = data[METRICS_CSV_KEY];

  if (!csv) {
    window.alert('No latency data available yet. Run a query first.');
    return;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `cotrace-latency-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
