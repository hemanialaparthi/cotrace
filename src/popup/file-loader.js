// ===== FILE LOADER MODULE =====
// Handles loading active file data and fetching revision history

let activeFile = null;
let fileMetadata = null;
let revisionHistory = null;

// Load active file from storage
function loadActiveFile() {
  chrome.storage.local.get(['activeFile'], (data) => {
    if (data.activeFile) {
      activeFile = data.activeFile;
      addSystemMessage(`Document loaded: "${activeFile.title}". What would you like to know about the changes?`);
      // Optionally pre-fetch file metadata for faster queries
      // Not auto-fetching to save API calls
    } else {
      addSystemMessage('No document detected. Please open a Google Doc, Sheet, or Slide to use CoTrace.');
    }
  });
}

// Fetch file metadata and revisions
async function fetchFileMetadata() {
  return new Promise((resolve, reject) => {
    if (!activeFile) {
      console.error('No active file');
      resolve(false);
      return;
    }

    chrome.runtime.sendMessage(
      { action: 'FETCH_DATA', fileId: activeFile.id },
      (res) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log('FETCH_DATA response:', res);
        
        if (res && res.meta && res.revisions) {
          fileMetadata = res.meta;
          revisionHistory = res.revisions;
          console.log('Successfully fetched data. Revisions count:', revisionHistory.revisions?.length);
          resolve(true);
        } else {
          console.error('Invalid response format:', res);
          resolve(false);
        }
      }
    );
  });
}

// Getters for shared state
function getActiveFile() {
  return activeFile;
}

function getFileMetadata() {
  return fileMetadata;
}

function getRevisionHistory() {
  return revisionHistory;
}
