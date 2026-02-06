let authToken = null;

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
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,modifiedTime,owners`,
    {
      headers: {
        "Authorization": "Bearer " + authToken
      }
    }
  );
  return res.json();
}

async function fetchRevisions(fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/revisions`,
    {
      headers: {
        "Authorization": "Bearer " + authToken
      }
    }
  );
  return res.json();
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
    });

    return true;
  }
});
