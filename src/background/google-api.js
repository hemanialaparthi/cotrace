// ===== GOOGLE DRIVE API MODULE =====
// Handles all Google Drive API calls for file metadata and revisions

// Fetch file metadata from Google Drive
async function fetchFileMetadata(fileId, authToken) {
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

// Fetch all revisions for a file
async function fetchRevisions(fileId, authToken) {
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

// Fetch content of a specific revision
async function fetchRevisionContent(fileId, revisionId, authToken) {
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
