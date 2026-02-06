function detectGoogleFile() {
  const url = window.location.href;
  let type = null;

  if (url.includes("/document/")) type = "doc";
  if (url.includes("/spreadsheets/")) type = "sheet";
  if (url.includes("/presentation/")) type = "slide";

  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const id = match ? match[1] : null;

  return { type, id, title: document.title };
}

const fileData = detectGoogleFile();

if (fileData.id) {
  chrome.storage.local.set({
    activeFile: fileData
  });
  console.log("cotrace detected:", fileData);
}
