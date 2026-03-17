// ===== MAIN POPUP SCRIPT =====
// Coordinates all popup modules

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
}

async function initializePopup() {
  console.log('Initializing Cotrace popup...');
  
  // Load active file FIRST so we have the file context
  await loadActiveFile();
  
  // Initialize all modules
  initAuthUI();
  const hadPreviousChat = await initChatUI();  // Load chat history
  initTabs();
  
  // Show welcome message only if no previous chat history
  if (!hadPreviousChat) {
    showFileLoadedMessage();
  }
  
  // Check authentication status
  checkAuthStatus();
  
  console.log('Cotrace popup initialized successfully');
}
