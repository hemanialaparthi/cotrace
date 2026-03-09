let authToken = null;
let currentUser = null;

// Track active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab || !tab.url) {
      console.log("Skipping non-accessible tab");
      return;
    }
    
    if (tab.url.includes("docs.google.com")) {
      // Inject content script to detect file
      chrome.scripting.executeScript({
        target: { tabId: activeInfo.tabId },
        function: detectGoogleFile
      });
    }
  });
});

function detectGoogleFile() {
  const url = window.location.href;
  let type = null;

  if (url.includes("/document/")) type = "doc";
  if (url.includes("/spreadsheets/")) type = "sheet";
  if (url.includes("/presentation/")) type = "slide";

  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const id = match ? match[1] : null;

  if (id) {
    chrome.storage.local.set({
      activeFile: { type, id, title: document.title }
    });
  }
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

// Check authentication on startup
chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.local.get(['authToken', 'authUser']);
  if (result.authToken) {
    authToken = result.authToken;
    currentUser = result.authUser;
    console.log('Restored auth session for:', currentUser?.email);
  }
});

// Check authentication when extension is installed/updated
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get(['authToken', 'authUser']);
  if (result.authToken) {
    authToken = result.authToken;
    currentUser = result.authUser;
    console.log('Auth available for:', currentUser?.email);
  }
});

async function getUserInfo(sendResponse) {
  if (!authToken) {
    console.error("No auth token available");
    sendResponse({ success: false, error: "Not authenticated" });
    return;
  }

  try {
    // Get user's profile info from Google People API
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

async function fetchFileMetadata(fileId) {
  if (!authToken) {
    console.error("No auth token available");
    return null;
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,modifiedTime,owners`,
      {
        headers: {
          "Authorization": "Bearer " + authToken
        }
      }
    );
    
    if (!res.ok) {
      console.error("API Error:", res.status);
      return null;
    }
    
    return res.json();
  } catch (error) {
    console.error("Fetch error:", error);
    return null;
  }
}

async function fetchRevisions(fileId) {
  if (!authToken) {
    console.error("No auth token available");
    return null;
  }

  try {
    // Try to get all revision fields with user information
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/revisions?fields=*`,
      {
        headers: {
          "Authorization": "Bearer " + authToken
        }
      }
    );
    
    if (!res.ok) {
      console.error("API Error:", res.status);
      const errorBody = await res.text();
      console.error("Error body:", errorBody);
      return null;
    }
    
    const data = await res.json();
    console.log('Raw API response:', data);
    
    // Log first revision to see what fields are available
    if (data.revisions && data.revisions.length > 0) {
      console.log('First revision object:', data.revisions[0]);
    }
    
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    return null;
  }
}

async function fetchRevisionContent(fileId, revisionId) {
  if (!authToken) {
    console.error("No auth token available");
    return null;
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}?fields=*`,
      {
        headers: {
          "Authorization": "Bearer " + authToken
        }
      }
    );
    
    if (!res.ok) {
      const errorBody = await res.text();
      console.error("API Error:", res.status, errorBody);
      return null;
    }
    
    const revisionData = await res.json();
    console.log("Revision data:", revisionData);
    
    // Get the export links for the file
    const exportUrl = revisionData.exportLinks?.['text/plain'] || 
                      revisionData.exportLinks?.['text/html'] ||
                      revisionData.webContentLink;
    
    if (!exportUrl) {
      console.error("No export link available for this revision");
      return null;
    }
    
    // Fetch the actual content
    const contentRes = await fetch(exportUrl, {
      headers: {
        "Authorization": "Bearer " + authToken
      }
    });
    
    if (!contentRes.ok) {
      console.error("Content fetch error:", contentRes.status);
      return null;
    }
    
    return contentRes.text();
  } catch (error) {
    console.error("Fetch error:", error);
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "AUTH") {
    authenticate(sendResponse);
    return true; // Will respond asynchronously
  }

  if (msg.action === "GET_USER_INFO") {
    // Return cached user if available
    if (currentUser) {
      sendResponse({ success: true, user: currentUser });
    } else {
      getUserInfo(sendResponse);
    }
    return true;
  }

  if (msg.action === "CHECK_AUTH") {
    // Quick check if user is authenticated
    sendResponse({ 
      authenticated: !!authToken && !!currentUser,
      user: currentUser
    });
    return true;
  }

  if (msg.action === "LOGOUT") {
    logout(sendResponse);
    return true;
  }

  if (msg.action === "FETCH_DATA") {
    const { fileId } = msg;

    Promise.all([
      fetchFileMetadata(fileId),
      fetchRevisions(fileId)
    ]).then(([meta, revisions]) => {
      sendResponse({ meta, revisions });
    }).catch((error) => {
      console.error("Error fetching data:", error);
      sendResponse({ error: error.message });
    });

    return true;
  }

  if (msg.action === "FETCH_REVISION_CONTENT") {
    const { fileId, revisionId } = msg;

    fetchRevisionContent(fileId, revisionId).then((content) => {
      sendResponse({ content });
    }).catch((error) => {
      console.error("Error fetching revision content:", error);
      sendResponse({ error: error.message });
    });

    return true;
  }
});
