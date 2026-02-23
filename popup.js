let activeFile = null;

chrome.storage.local.get(["activeFile"], (data) => {
  if (data.activeFile) {
    activeFile = data.activeFile;
    document.getElementById("docTitle").innerText = activeFile.title;
    document.getElementById("fileType").innerText = activeFile.type;
  }
});

document.getElementById("loginBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "AUTH" }, (res) => {
    if (res?.success) {
      console.log("Connected to Google.");
    }
  });
});

document.getElementById("analyzeBtn").addEventListener("click", () => {
  if (!activeFile) {
    alert("No active file detected");
    return;
  }

  chrome.runtime.sendMessage(
    { action: "FETCH_DATA", fileId: activeFile.id },
    (res) => {
      if (!res) return;

      const meta = res.meta;
      const revisions = res.revisions;

      document.getElementById("owner").innerText =
        meta.owners?.[0]?.displayName || "Unknown";

      document.getElementById("modified").innerText =
        new Date(meta.modifiedTime).toLocaleString();

      document.getElementById("revisions").innerText =
        revisions.revisions?.length || 0;
    }
  );
});
