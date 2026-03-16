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
  const accountBtn = document.querySelector('.account-btn');
  if (!accountBtn) return;

  if (authenticated && user) {
    // Show user's profile picture if available
    if (user.picture) {
      accountBtn.innerHTML = `<img src="${user.picture}" alt="${user.name}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`;
    }
    accountBtn.title = `Signed in as ${user.name} (${user.email})`;
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
  const accountBtn = document.querySelector('.account-btn');
  const settingsBtn = document.querySelector('.settings-btn');
  const signOutBtn = document.querySelector('.sign-out-btn');

  if (accountBtn) {
    accountBtn.addEventListener('click', handleAuthButtonClick);
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', handleSettingsButtonClick);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', handleSignOut);
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', closeSettingsDropdown);
  
  console.log('Auth UI initialized:', {
    accountBtn: !!accountBtn,
    settingsBtn: !!settingsBtn,
    signOutBtn: !!signOutBtn
  });
}

// Handle account button click (login only)
function handleAuthButtonClick() {
  if (!isAuthenticated) {
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

// Toggle settings dropdown
function handleSettingsButtonClick(e) {
  e.stopPropagation();
  const dropdown = document.querySelector('.settings-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('active');
  }
}

// Close settings dropdown
function closeSettingsDropdown(e) {
  const dropdown = document.querySelector('.settings-dropdown');
  const settingsBtn = document.querySelector('.settings-btn');
  const container = document.querySelector('.settings-menu-container');
  
  if (dropdown && !container?.contains(e.target)) {
    dropdown.classList.remove('active');
  }
}

// Handle sign out
function handleSignOut() {
  console.log('handleSignOut called');
  
  // Close dropdown
  const dropdown = document.querySelector('.settings-dropdown');
  if (dropdown) {
    dropdown.classList.remove('active');
  }
  
  if (confirm('Are you sure you want to sign out?')) {
    console.log('Confirming sign out...');
    chrome.runtime.sendMessage({ action: 'LOGOUT' }, (res) => {
      console.log('Sign out response:', res);
      if (res?.success) {
        isAuthenticated = false;
        currentUser = null;
        updateAccountButton(false);
        // Successfully signed out - no chat message
        console.log('Successfully signed out');
      } else {
        console.error('Failed to sign out:', res?.error);
      }
    });
  }
}

// Get current authentication status
function getAuthStatus() {
  return { isAuthenticated, currentUser };
}
