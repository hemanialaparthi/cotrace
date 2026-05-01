# CoTrace – Semantic Summarization of Collaborative Changes

**CoTrace** is a Chrome extension that uses AI (Claude) to intelligently summarize the collaborative editing history of Google Docs, Sheets, and Slides. Instead of manually reviewing revision histories, users get instant semantic summaries of what changed and why.

## Features

- 🤖 **AI-Powered Summaries** – Uses Claude to understand and explain changes
- 📊 **Multi-Document Support** – Works with Google Docs, Sheets, and Slides
- 👥 **Contributor Insights** – View contributions by author
- 🔍 **Change Analysis** – Compare specific versions and see detailed diffs
- ⚡ **Low-Latency Streaming** – Real-time responses with optimized server backend
- 🔐 **Privacy-First** – OAuth2 authentication, no data storage on disk

---

## Project Architecture

```
cotrace/
├── Extension (Chrome)
│   ├── background-new.js          # Service worker coordination
│   ├── content.js                 # Google Docs file detection
│   ├── manifest.json              # Extension configuration
│   ├── popup2-new.html            # UI panel
│   ├── popup2-new.js              # Popup orchestration
│   ├── styles2.css                # Styling
│   └── src/
│       ├── background/            # Auth, file detection, Google API
│       └── popup/                 # Chat, contributions, changes views
│
├── Backend (Node.js/Express)
│   ├── cotrace-backend/
│   │   ├── server.js              # API server, Claude integration
│   │   ├── package.json           # Dependencies
│   │   └── .env                   # Configuration (API keys)
│
└── Experiments/
    └── repo-transfer/experiment-results/  # Latency benchmarks
```

---

## Prerequisites

Before setting up locally, ensure you have:

- **Node.js** (v16+) and npm
- **Google Account** with access to create OAuth credentials
- **Claude API Key** (from Anthropic)
- **Chrome Browser** (v90+)
- **Git** (for cloning/version control)

---

## Setup Guide

### Step 1: Clone & Install Dependencies

```bash
# Clone the repository
git clone <repo-url>
cd cotrace

# Install backend dependencies
cd cotrace-backend
npm install
cd ..
```

### Step 2: Configure Google OAuth

The extension uses Google OAuth2 for secure authentication.

#### 2a. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (name it "CoTrace")
3. Enable these APIs:
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - Google Slides API

#### 2b. Create OAuth2 Credentials

1. Navigate to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
2. Choose **Chrome App**
3. Enter your **Application ID** (will be generated when you load the extension, see Step 4)
4. Save your **Client ID** (you'll use this in the manifest)

#### 2c. Update manifest.json

In `manifest.json`, update the OAuth client ID:

```json
{
  "oauth2": {
    "client_id": "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/documents.readonly"
    ]
  }
}
```

### Step 3: Configure Claude API

#### 3a. Get Your API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key
3. Copy the key (keep it secret!)

#### 3b. Set Environment Variables

Create `cotrace-backend/.env`:

```bash
# Claude API Configuration
CLAUDE_API_KEY=sk-ant-v1-xxxxxxxxxxxxxxxxxxxxxxxx

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS (optional, for local development)
CORS_ORIGIN=*
```

**⚠️ Security Note:** Never commit `.env` to version control. Add it to `.gitignore`.

### Step 4: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `cotrace/` folder
5. The extension will load and display an **Application ID**
6. Copy this ID and use it to create/update your Google OAuth credentials (if not already done)

---

## Running Locally

### Terminal 1: Start the Backend Server

```bash
cd cotrace-backend
npm run dev
```

Expected output:
```
Server running on http://localhost:3000
Listening for requests...
```

The `dev` script uses `nodemon`, which auto-restarts on code changes.

### Terminal 2: Test the Extension

1. Open a Google Doc/Sheet/Slide in Chrome
2. Click the **CoTrace** extension icon in the toolbar
3. Click **Sign In** to authenticate with Google
4. Once authenticated, click **Chat** tab
5. Type a question (e.g., "What changed in this document?")
6. The extension will fetch revision history and send to your backend
7. Claude's response will stream back in real-time

### Verify Everything Works

**Extension logs** (to see requests):
- Open `chrome://extensions/` → Click **Details** on CoTrace → **Background page**
- Watch the DevTools console for messages like `"CoTrace background service worker started"`

**Backend logs** (to see API calls):
- Check terminal running `npm run dev`
- Watch for timing information and API latency

---

## Development Workflow

### Making Changes

**Backend Changes:**
- Edit `cotrace-backend/server.js`
- `nodemon` will auto-restart
- Refresh extension popup to pick up changes

**Extension UI Changes:**
- Edit files in `src/popup/` or `popup2-new.html`
- Go to `chrome://extensions/` → Click refresh icon on Cotrace
- Reload the Google Doc tab to test

**Service Worker Changes:**
- Edit `background-new.js` or `src/background/*`
- Go to `chrome://extensions/` → Click refresh icon on CoTrace
- You may need to reload extension and close/reopen popup

### Testing & Debugging

**Chrome DevTools:**
```javascript
// In extension background page console:
chrome.runtime.sendMessage({action: 'CHECK_AUTH'}, (res) => console.log(res));
```

**Backend Debugging:**
```bash
# Add debug output
DEBUG=* npm run dev

# Or use Node inspector
node --inspect-brk cotrace-backend/server.js
```

---

## API Endpoints

### POST `/api/summarize`

Fetches file revision history and generates an AI summary.

**Request:**
```json
{
  "fileId": "1walIKKBkl1bf47NgV8oO_6T5yd3OA5yn6IjAwZh4hCU",
  "accessToken": "ya29.a0AfH6SMBx...",
  "query": "What changed?"
}
```

**Response (Streaming):**
```
data: {meta: {...timing data...}}
data: {chunk: "This document was updated..."}
data: {chunk: "with new sections..."}
```

---

## Error Handling & Fallbacks

CoTrace gracefully handles API failures with intelligent fallbacks:

### Example: Claude API Unavailable

If the Claude API is unreachable or rate-limited, the extension provides a cached summary:

```javascript
// In cotrace-backend/server.js
try {
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }]
  });
} catch (error) {
  if (error.status === 429) {
    // Rate limited - return cached summary
    res.write(`data: ${JSON.stringify({
      chunk: "Claude API is busy. Showing cached summary from last request...",
      cached: true
    })}\n\n`);
    res.write(`data: ${JSON.stringify({ chunk: previousSummary })}\n\n`);
  } else {
    // Connection error - return generic fallback
    res.write(`data: ${JSON.stringify({
      chunk: "Unable to reach AI service. Here's the raw revision history instead:",
      fallback: true
    })}\n\n`);
  }
}
```

### Example: Google API Fails

If revision history can't be fetched, CoTrace shows a helpful error:

```javascript
// In cotrace-backend/server.js
try {
  const revisions = await drive.revisions.list({
    fileId: fileId,
    fields: "revisions(id,modifiedTime,lastModifyingUser,changeTime)"
  });
} catch (error) {
  if (error.code === 403) {
    return res.status(403).json({
      error: "Access denied. Please re-authenticate.",
      action: "sign-in"
    });
  } else if (error.code === 404) {
    return res.status(404).json({
      error: "File not found or deleted.",
      action: "select-another-file"
    });
  }
  // Generic fallback
  return res.status(500).json({
    error: "Could not fetch revision history.",
    fallback: "Try again or contact support"
  });
}
```

### User-Facing Fallback Flow

1. **Primary:** Fetch live data from Google API + Claude summary
2. **Secondary:** If Claude fails → show cached summary from storage
3. **Tertiary:** If Google API fails → show local document changes only
4. **Final:** Clear error message with actionable next steps

---

## Project Structure Deep Dive

### Extension Files

| File | Purpose |
|------|---------|
| `background-new.js` | Orchestrates auth, file detection, API calls |
| `content.js` | Detects Google file ID/type on page load |
| `manifest.json` | Extension metadata, permissions, OAuth config |
| `popup2-new.html` | UI layout (chat, contributions, changes views) |
| `popup2-new.js` | Popup initialization & module coordination |
| `src/background/auth.js` | OAuth2 token management & restoration |
| `src/background/google-api.js` | Google Drive API wrapper (fetch metadata, revisions) |
| `src/background/file-detection.js` | Monitors active tabs for Google Docs |
| `src/popup/chat.js` | Chat interface & message streaming |
| `src/popup/contributions.js` | Author contribution view |
| `src/popup/changes.js` | Version comparison & diff display |
| `src/popup/file-loader.js` | Loads active file context |
| `src/popup/auth-ui.js` | Login/logout UI |
| `src/popup/tabs.js` | Tab switching logic |

### Backend Files

| File | Purpose |
|------|---------|
| `server.js` | Express app, Claude API integration, streaming |
| `package.json` | Dependencies: express, axios, claude API, diff lib |
| `.env` | Environment variables (API keys, port) |

---

## Troubleshooting

### Extension Won't Load

**Problem:** "Manifest errors" when loading unpacked extension

**Solution:**
- Ensure `manifest.json` has valid JSON syntax
- Check `client_id` in `oauth2` section matches Google credentials
- Restart Chrome

### "Authentication Failed"

**Problem:** Can't sign in or token expires

**Solution:**
- Clear Chrome storage: `chrome://extensions/` → Details → "Clear browsing data"
- Restart extension
- Re-authenticate
- Check `.env` CLAUDE_API_KEY is set

### Backend Returns 401 Errors

**Problem:** "Unauthorized" when calling Google APIs

**Solution:**
- Verify `accessToken` is valid and not expired
- Check Google Cloud project has Drive API enabled
- Ensure OAuth scopes include `drive.readonly`

### Slow Responses

**Problem:** Requests take 10+ seconds

**Solution:**
- Check backend logs: Are Google API calls slow?
- Monitor Claude API latency (check `server_ttfb_ms` in response)
- Verify network connection (try `curl https://api.anthropic.com`)
- Reduce content size (fewer revisions) for testing

### "CORS Error"

**Problem:** Extension can't reach backend

**Solution:**
- Ensure backend is running (`npm run dev` in cotrace-backend/)
- Check `CORS_ORIGIN` in `.env` includes `chrome-extension://...`
- Verify port 3000 is not in use (`lsof -i :3000`)

### Extension Popup Blank

**Problem:** Popup shows nothing when clicked

**Solution:**
- Check `chrome://extensions/` background page console for errors
- Reload extension (click refresh icon)
- Clear cache: `chrome://extensions/` → Details → "Clear browsing data"
- Verify `loadActiveFile()` completes successfully

---

## Support

For issues or questions:
- Check **Troubleshooting** section above
- Review backend logs: `npm run dev`
- Check extension background page console: `chrome://extensions/`
- See experiment results in `repo-transfer/experiment-results/README.md` for performance baseline
