// ===== AUTHENTICATION UI MODULE =====
// Handles authentication UI and user interactions

let isAuthenticated = false;
let currentUser = null;

// Check authentication status on load
async function checkAuthStatus() {
  chrome.runtime.sendMessage({ action: 'CHECK_AUTH' }, (res) => {
    if (res?.authenticated && res?.user) {
      isAuthenticated = true;
      currentUser = res.user;
      updateAccountButton(true, res.user);
      // Silently authenticated - no chat message
    } else {
      isAuthenticated = false;
      currentUser = null;
      updateAccountButton(false);
      // Not authenticated - no chat message
    }
  });
}

// Update account button appearance based on auth state
function updateAccountButton(authenticated, user = null) {
  const accountBtn = document.querySelector('.icon-btn');
  if (!accountBtn) return;

  if (authenticated && user) {
    // Show user's profile picture if available
    if (user.picture) {
      accountBtn.innerHTML = `<img src="${user.picture}" alt="${user.name}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`;
    }
    accountBtn.title = `Signed in as ${user.name} (${user.email})\nClick to sign out`;
    accountBtn.style.border = '2px solid var(--accent)';
    accountBtn.style.opacity = '1';
  } else {
    // Show default account icon
    accountBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>`;
    accountBtn.title = 'Click to sign in with Google';
    accountBtn.style.border = 'none';
    accountBtn.style.opacity = '0.7';
  }
}

// Initialize authentication UI handlers
function initAuthUI() {
  const accountBtn = document.querySelector('.icon-btn');
  if (accountBtn) {
    accountBtn.addEventListener('click', handleAuthButtonClick);
  }
}

// Handle account button click (login/logout)
function handleAuthButtonClick() {
  if (isAuthenticated) {
    // Logout
    if (confirm('Are you sure you want to sign out?')) {
      chrome.runtime.sendMessage({ action: 'LOGOUT' }, (res) => {
        if (res?.success) {
          isAuthenticated = false;
          currentUser = null;
          updateAccountButton(false);
          // Successfully signed out - no chat message
        } else {
          console.error('Failed to sign out:', res?.error);
        }
      });
    }
  } else {
    // Login - This will trigger Google's OAuth consent screen
    chrome.runtime.sendMessage({ action: 'AUTH' }, (res) => {
      console.log('AUTH response received:', res);
      console.log('chrome.runtime.lastError:', chrome.runtime.lastError);
      
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
      } else if (res?.success && res?.user) {
        isAuthenticated = true;
        currentUser = res.user;
        updateAccountButton(true, res.user);
        // Successfully authenticated - no chat message
      } else {
        console.error('Auth failed with response:', res);
      }
    });
  }
}

// Get current authentication status
function getAuthStatus() {
  return { isAuthenticated, currentUser };
}
