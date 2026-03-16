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
    let allRevisions = [];
    let pageToken = null;
    let pageCount = 0;

    // Paginate through all revisions
    do {
      pageCount++;
      const pageTokenParam = pageToken ? `&pageToken=${pageToken}` : '';
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/revisions?fields=*${pageTokenParam}`,
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
      console.log(`[FETCH] Page ${pageCount}: Got ${data.revisions?.length || 0} revisions`);
      
      if (data.revisions) {
        allRevisions = allRevisions.concat(data.revisions);
      }
      
      // Check if there are more pages
      pageToken = data.nextPageToken;
    } while (pageToken);

    console.log(`[FETCH] Total revisions fetched: ${allRevisions.length} across ${pageCount} pages`);
    
    // Log first revision to see what fields are available
    if (allRevisions.length > 0) {
      console.log('First revision object:', allRevisions[0]);
    }
    
    return { revisions: allRevisions };
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
