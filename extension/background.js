const XDM_BASE = 'http://127.0.0.1:19684';

// License status cache
let cachedLicense = null;
let lastLicenseCheck = 0;

async function checkProLicense(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedLicense && (now - lastLicenseCheck < 5000)) {
    return cachedLicense;
  }
  try {
    const res = await fetch(`${XDM_BASE}/api/license`, { cache: 'no-store' });
    if (!res.ok) {
      cachedLicense = { isPro: false, isBanned: false, status: 'offline' };
      return cachedLicense;
    }
    const data = await res.json();
    const isPro = Boolean(data.isPro && !data.isBanned && data.status !== 'suspended' && data.status !== 'revoked');
    cachedLicense = {
      isPro,
      isBanned: Boolean(data.isBanned),
      status: data.status || 'free',
      edition: data.edition || 'free',
      data
    };
    lastLicenseCheck = now;
    return cachedLicense;
  } catch (e) {
    return { isPro: false, isBanned: false, status: 'offline' };
  }
}

function notifyProRequired() {
  chrome.action.setBadgeText({ text: 'PRO' });
  chrome.action.setBadgeBackgroundColor({ color: '#f43f5e' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 4000);
}

// Setup context menus safely without duplicate id conflicts
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
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
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!targetUrl) return;

  const license = await checkProLicense(true);
  if (!license || !license.isPro) {
    notifyProRequired();
    return;
  }

  fetch(`${XDM_BASE}/api/downloads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-xdm-source': 'extension'
    },
    body: JSON.stringify({ url: targetUrl, autoStart: true, isFromExtension: true })
  }).then(async (res) => {
    if (res.ok) {
      notify('XDM Turbo', 'Download sent to XDM Turbo successfully!');
    } else {
      const errData = await res.json().catch(() => ({}));
      if (errData.proRequired) {
        notifyProRequired();
      }
    }
  }).catch((err) => {
    notify('XDM Error', 'Could not connect to XDM engine. Ensure XDM is running.');
  });
});

function notify(title, message) {
  // Use badge or simple console
  chrome.action.setBadgeText({ text: 'OK' });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

const ALLOWED_EXTENSIONS = new Set([
  // Archives
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'xz', 'tgz', 'cab', 'z',
  // Executables & Installers
  'exe', 'msi', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appx', 'bin',
  // Video
  'mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'webm', 'm4v', '3gp', 'ts', 'm2ts',
  // Audio
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus',
  // Documents & Media
  'pdf', 'epub', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'torrent'
]);

const BLOCKED_DOMAINS = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'facebook.com/tr', 'adnxs.com', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'scorecardresearch.com', 'quantserve.com', 'criteo.com',
  'amazon-adsystem.com', 'analytics', 'telemetry', 'beacon'
];

function isCapturableDownload(downloadItem) {
  if (!downloadItem || !downloadItem.url) return false;
  const url = downloadItem.url.toLowerCase();

  // Ignore internal/browser protocols
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome:') || url.startsWith('edge:') || url.startsWith('about:')) {
    return false;
  }

  // Block ad and tracking domains from being downloaded
  if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
    return false;
  }

  // Check file extension
  let filename = (downloadItem.filename || '').split(/[\\/]/).pop() || '';
  let ext = '';

  if (filename.includes('.')) {
    ext = filename.split('.').pop().toLowerCase();
  } else {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const urlFile = cleanUrl.split('/').pop() || '';
    if (urlFile.includes('.')) {
      ext = urlFile.split('.').pop().toLowerCase();
    }
  }

  // Strictly check allowed file extensions
  if (ext && ALLOWED_EXTENSIONS.has(ext)) {
    return true;
  }

  // If MIME type is explicitly an archive, video, or audio
  const mime = (downloadItem.mime || '').toLowerCase();
  if (mime.startsWith('video/') || mime.startsWith('audio/') || 
      mime.includes('zip') || mime.includes('octet-stream') || 
      mime.includes('x-msdownload') || mime.includes('pdf')) {
    // Only capture if not an html or script file
    if (!['html', 'htm', 'php', 'asp', 'jsp', 'aspx', 'js', 'json', 'css', 'xml'].includes(ext)) {
      return true;
    }
  }

  return false;
}

// Auto-intercept browser downloads into XDM Turbo (IDM style) with strict filter
if (chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(async (downloadItem) => {
    if (!isCapturableDownload(downloadItem)) return;

    // Check PRO license on every single file download intercepted by the extension
    const license = await checkProLicense(true);
    if (!license || !license.isPro) {
      // Free version: Browser download capture is OFF. Let browser download normally.
      return;
    }

    try {
      const res = await fetch(`${XDM_BASE}/api/downloads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-xdm-source': 'extension'
        },
        body: JSON.stringify({
          url: downloadItem.url,
          fileName: downloadItem.filename ? downloadItem.filename.split(/[\\/]/).pop() : undefined,
          autoStart: true,
          isFromExtension: true
        })
      });

      if (res.ok) {
        // Cancel browser's slow single-thread download only after XDM successfully accepts the job
        try {
          chrome.downloads.cancel(downloadItem.id);
          chrome.downloads.erase({ id: downloadItem.id });
        } catch (e) {}
        notify('XDM Turbo', 'Captured download: ' + (downloadItem.filename || downloadItem.url));
      }
    } catch (err) {
      // If XDM engine is not running, let browser download as usual
    }
  });
}

// Tab-based media sniffer cache (IDM style)
const sniffedMediaByTab = new Map();

if (chrome.webRequest && chrome.webRequest.onResponseStarted) {
  chrome.webRequest.onResponseStarted.addListener((details) => {
    if (!details || details.tabId <= 0) return;
    const url = details.url;
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;

    let isVideo = url.includes('.mp4') || 
                  url.includes('cdninstagram.com') || 
                  url.includes('fbcdn.net') || 
                  url.includes('googlevideo.com') ||
                  url.includes('.webm') ||
                  url.includes('mime=video') ||
                  url.includes('bytestart=');

    if (!isVideo && details.responseHeaders) {
      for (const h of details.responseHeaders) {
        if (h.name && h.name.toLowerCase() === 'content-type') {
          const val = (h.value || '').toLowerCase();
          if (val.startsWith('video/') || val.includes('mp4') || val.includes('octet-stream')) {
            isVideo = true;
            break;
          }
        }
      }
    }

    if (isVideo && !url.includes('.m3u8')) {
      let list = sniffedMediaByTab.get(details.tabId) || [];
      if (!list.includes(url)) {
        list = [url, ...list].slice(0, 10);
        sniffedMediaByTab.set(details.tabId, list);
      }
    }
  }, { urls: ["<all_urls>"] }, ["responseHeaders"]);
}

if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    sniffedMediaByTab.delete(tabId);
  });
}

// Message handler between content scripts, popup, and local XDM engine
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Security: Verify message originates strictly from this extension's tabs or popup
  if (sender.id !== chrome.runtime.id) {
    console.warn('[Security] Ignored message from unauthorized extension sender:', sender);
    return false;
  }

  if (request.action === 'PING_XDM') {
    fetch(`${XDM_BASE}/api/stats`)
      .then(r => r.json())
      .then(data => sendResponse({ online: true, data }))
      .catch(() => sendResponse({ online: false }));
    return true; // Keep async channel open
  }

  if (request.action === 'GET_LICENSE_STATUS') {
    checkProLicense(Boolean(request.forceRefresh))
      .then(lic => sendResponse({ success: true, isPro: lic.isPro, isBanned: lic.isBanned, status: lic.status }))
      .catch(() => sendResponse({ success: false, isPro: false }));
    return true;
  }

  if (request.action === 'GET_VIDEO_INFO') {
    fetch(`${XDM_BASE}/api/video/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-xdm-source': 'extension'
      },
      body: JSON.stringify({ url: request.url, isFromExtension: true })
    })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'START_DOWNLOAD') {
    (async () => {
      // Check PRO license for every single download triggered via extension
      const license = await checkProLicense(true);
      if (!license || !license.isPro) {
        notifyProRequired();
        return sendResponse({
          success: false,
          error: 'XDM Turbo PRO license required for extension downloads',
          proRequired: true
        });
      }

      const payload = request.payload || {};
      let targetUrl = payload.directUrl || payload.url || request.url || '';

      // If target is Instagram, Facebook or blob URL without direct MP4, check our tab's sniffed media cache
      const tabId = sender.tab ? sender.tab.id : undefined;
      if (tabId && (!targetUrl || targetUrl.startsWith('blob:') || /instagram\.com|facebook\.com/i.test(targetUrl))) {
        if (!targetUrl.includes('.mp4') && !targetUrl.includes('cdninstagram.com') && !targetUrl.includes('fbcdn.net')) {
          const cached = sniffedMediaByTab.get(tabId);
          if (cached && cached.length > 0) {
            targetUrl = cached[0];
            payload.url = targetUrl;
          }
        }
      }

      // Direct stream URLs (.mp4, cdninstagram, fbcdn, bytestart) go directly to Turbo 32-connection engine
      // YouTube page URLs go to VideoDownloader (yt-dlp) to resolve formats and merge streams
      const isDirectStream = targetUrl.includes('.mp4') || 
                             targetUrl.includes('cdninstagram.com') || 
                             targetUrl.includes('fbcdn.net') || 
                             targetUrl.includes('bytestart=') || 
                             targetUrl.includes('mime=video');

      const isYouTube = /youtube\.com|youtu\.be/i.test(targetUrl);
      const endpoint = (isYouTube && !isDirectStream) ? `${XDM_BASE}/api/video/download` : `${XDM_BASE}/api/downloads`;

      const cleanTitle = (payload.title || 'Video_Download').replace(/[<>:"/\\|?*]+/g, '_').trim();
      const fileName = isDirectStream ? `${cleanTitle}.mp4` : undefined;

      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-xdm-source': 'extension'
          },
          body: JSON.stringify({
            url: targetUrl,
            fileName: fileName,
            title: cleanTitle,
            formatId: payload.formatId,
            autoStart: true,
            isFromExtension: true
          })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (data.proRequired) notifyProRequired();
          return sendResponse({
            success: false,
            error: data.error || 'Server rejected download',
            proRequired: Boolean(data.proRequired)
          });
        }
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
