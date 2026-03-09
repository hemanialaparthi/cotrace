// ===== MAIN POPUP SCRIPT =====
// Coordinates all popup modules

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
}

function initializePopup() {
  console.log('Initializing Cotrace popup...');
  
  // Initialize all modules
  initAuthUI();
  initChatUI();
  initTabs();
  
  // Check authentication status
  checkAuthStatus();
  
  // Load active file
  loadActiveFile();
  
  console.log('Cotrace popup initialized successfully');
}
