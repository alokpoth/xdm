const XDM_BASE = 'http://127.0.0.1:19684';

// Setup context menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'xdm-download-link',
    title: 'Download with XDM Turbo',
    contexts: ['link', 'image', 'video', 'audio']
  });

  chrome.contextMenus.create({
    id: 'xdm-download-page-video',
    title: 'Download Video from this page with XDM',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!targetUrl) return;

  fetch(`${XDM_BASE}/api/downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetUrl, autoStart: true })
  }).then(async (res) => {
    if (res.ok) {
      notify('XDM Turbo', 'Download sent to XDM Turbo successfully!');
    }
  }).catch((err) => {
    notify('XDM Error', 'Could not connect to XDM engine. Ensure XDM is running.');
  });
});

function notify(title, message) {
  // Use badge or simple console
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

// Message handler between content scripts, popup, and local XDM engine
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING_XDM') {
    fetch(`${XDM_BASE}/api/health`)
      .then(r => r.json())
      .then(data => sendResponse({ online: true, data }))
      .catch(() => sendResponse({ online: false }));
    return true; // Keep async channel open
  }

  if (request.action === 'GET_VIDEO_INFO') {
    fetch(`${XDM_BASE}/api/video/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: request.url })
    })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'START_DOWNLOAD') {
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(request.url);
    const endpoint = isVideoSite ? `${XDM_BASE}/api/video/download` : `${XDM_BASE}/api/downloads`;

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload)
    })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
