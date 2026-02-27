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

function authenticate(sendResponse) {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
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
