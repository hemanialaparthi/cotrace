let authToken = null;

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

  if (url.includes("/document/")) type = "doc";uj
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

function authenticate(sendResponse) {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      sendResponse({ success: false });
      return;
    }
    authToken = token;
    sendResponse({ success: true });
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
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/revisions`,
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "AUTH") {
    authenticate(sendResponse);
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
});
