// Main Background Service Worker for Cotrace
// Coordinates authentication, file detection, and Google API calls

// import modules (using importScripts for service workers)
importScripts(
  'src/background/auth.js',
  'src/background/google-api.js',
  'src/background/file-detection.js'
);

// initialize on service worker start
console.log('Cotrace background service worker started');
restoreAuthState();
initFileDetection();

// handle startup events
chrome.runtime.onStartup.addListener(() => {
  restoreAuthState();
});

chrome.runtime.onInstalled.addListener(() => {
  restoreAuthState();
});

// Message Handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  
  // authentication actions
  if (msg.action === "AUTH") {
    authenticate(sendResponse);
    return true; // will respond asynchronously
  }

  if (msg.action === "GET_USER_INFO") {
    // Restore auth state first if needed
    if (!getCurrentUser()) {
      restoreAuthState().then(() => {
        if (getCurrentUser()) {
          sendResponse({ success: true, user: getCurrentUser() });
        } else {
          getUserInfo(sendResponse);
        }
      });
    } else {
      sendResponse({ success: true, user: getCurrentUser() });
    }
    return true;
  }

  if (msg.action === "CHECK_AUTH") {
    // Ensure auth state is restored from storage before checking
    if (!isAuthenticated()) {
      restoreAuthState().then(() => {
        sendResponse({ 
          authenticated: isAuthenticated(),
          user: getCurrentUser()
        });
      });
    } else {
      sendResponse({ 
        authenticated: isAuthenticated(),
        user: getCurrentUser()
      });
    }
    return true;
  }

  if (msg.action === "LOGOUT") {
    logout(sendResponse);
    return true;
  }

  // Google Drive API actions
  if (msg.action === "FETCH_DATA") {
    const { fileId } = msg;

    // Ensure auth state is restored before fetching data
    restoreAuthState().then(() => {
      const token = getAuthToken();
      return Promise.all([
        fetchFileMetadata(fileId, token),
        fetchRevisions(fileId, token)
      ]);
    }).then(([meta, revisions]) => {
      sendResponse({ meta, revisions });
    }).catch((error) => {
      console.error("Error fetching data:", error);
      sendResponse({ error: error.message });
    });

    return true;
  }

  if (msg.action === "FETCH_REVISION_CONTENT") {
    const { fileId, revisionId } = msg;

    // Ensure auth state is restored before fetching
    restoreAuthState().then(() => {
      const token = getAuthToken();
      return fetchRevisionContent(fileId, revisionId, token);
    }).then((content) => {
      sendResponse({ content });
    }).catch((error) => {
      console.error("Error fetching revision content:", error);
      sendResponse({ error: error.message });
    });

    return true;
  }
});
