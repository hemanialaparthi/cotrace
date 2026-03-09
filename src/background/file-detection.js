// ===== FILE DETECTION MODULE =====
// Handles detecting and tracking active Google Drive files

// Track active tab changes
function initFileDetection() {
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
}

// Function to inject into page to detect Google file
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
