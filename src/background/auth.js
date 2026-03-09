// ===== AUTHENTICATION MODULE =====
// Handles all Google OAuth authentication logic

let authToken = null;
let currentUser = null;

// Restore auth state from storage
async function restoreAuthState() {
  const result = await chrome.storage.local.get(['authToken', 'authUser']);
  if (result.authToken && result.authUser) {
    authToken = result.authToken;
    currentUser = result.authUser;
    console.log('✓ Auth state restored for:', currentUser?.email);
    return true;
  }
  return false;
}

// Enhanced authentication function with popup window
function authenticate(sendResponse) {
  console.log('Starting authentication flow...');
  
  // Check if already authenticated
  if (authToken && currentUser) {
    console.log('Already authenticated');
    sendResponse({ 
      success: true, 
      user: currentUser,
      message: 'Already signed in'
    });
    return;
  }

  // Use getAuthToken with interactive mode - Chrome handles the popup automatically
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      console.error('Authentication error:', chrome.runtime.lastError.message);
      
      if (chrome.runtime.lastError.message.includes('canceled') || 
          chrome.runtime.lastError.message.includes('closed')) {
        sendResponse({ 
          success: false, 
          error: 'User canceled sign-in',
          message: 'Sign-in was canceled. Please try again when ready.'
        });
      } else {
        sendResponse({ 
          success: false, 
          error: chrome.runtime.lastError.message,
          message: 'Authentication failed. Please try again.'
        });
      }
      return;
    }

    if (!token) {
      console.error('No token received');
      sendResponse({ 
        success: false, 
        error: 'No token received',
        message: 'Failed to get authentication token'
      });
      return;
    }

    authToken = token;
    console.log('✓ Auth token received:', token.substring(0, 20) + '...');
    
    fetchAndStoreUserInfo(sendResponse);
  });
}

// Helper function to fetch and store user info
function fetchAndStoreUserInfo(sendResponse) {
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
  .then(res => {
    console.log('User info response status:', res.status);
    if (!res.ok) {
      throw new Error(`Failed to fetch user info: ${res.status}`);
    }
    return res.json();
  })
  .then(userInfo => {
    console.log('User info received:', userInfo);
    currentUser = {
      name: userInfo.name || userInfo.given_name || 'User',
      email: userInfo.email,
      id: userInfo.id,
      picture: userInfo.picture
    };

    // Store user info
    return chrome.storage.local.set({ 
      authUser: currentUser,
      authToken: authToken
    });
  })
  .then(() => {
    console.log('✓ User authenticated:', currentUser.email);
    
    sendResponse({ 
      success: true, 
      user: currentUser,
      message: `Successfully signed in as ${currentUser.name}`
    });
  })
  .catch(error => {
    console.error('Error in authentication flow:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      message: 'Signed in but failed to get user information'
    });
  });
}

// Get user info from token
async function getUserInfo(sendResponse) {
  if (!authToken) {
    console.error("No auth token available");
    sendResponse({ success: false, error: "Not authenticated" });
    return;
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo`,
      {
        headers: {
          "Authorization": "Bearer " + authToken
        }
      }
    );
    
    if (!res.ok) {
      console.error("API Error:", res.status);
      sendResponse({ success: false, error: "Failed to fetch user info" });
      return;
    }
    
    const userInfo = await res.json();
    const user = {
      name: userInfo.name || userInfo.given_name || "User",
      email: userInfo.email,
      id: userInfo.id,
      picture: userInfo.picture
    };
    
    sendResponse({ 
      success: true, 
      user: user 
    });
  } catch (error) {
    console.error("fetch error:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Logout and revoke tokens
function logout(sendResponse) {
  if (!authToken) {
    sendResponse({ success: false, error: "Not authenticated" });
    return;
  }

  const tokenToRevoke = authToken;

  // Revoke the token with Google to ensure complete logout
  fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokenToRevoke}`, {
    method: 'POST'
  })
  .then(() => {
    console.log('✓ Token revoked with Google');
  })
  .catch((err) => {
    console.log('Note: Could not revoke token with Google (may already be invalid):', err);
  })
  .finally(() => {
    // Remove the cached auth token from Chrome
    chrome.identity.removeCachedAuthToken({ token: tokenToRevoke }, async () => {
      // Also try to clear any cached tokens from getAuthToken
      chrome.identity.clearAllCachedAuthTokens(() => {
        console.log('✓ All cached tokens cleared');
      });
      
      // Clear all auth data
      authToken = null;
      currentUser = null;
      await chrome.storage.local.remove(['authToken', 'authUser']);
      
      console.log('✓ User logged out completely');
      sendResponse({ success: true, message: 'Successfully signed out' });
    });
  });
}

// Get current auth token
function getAuthToken() {
  return authToken;
}

// Get current user
function getCurrentUser() {
  return currentUser;
}

// Check if authenticated
function isAuthenticated() {
  return !!authToken && !!currentUser;
}
