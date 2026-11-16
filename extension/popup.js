document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const videoTitle = document.getElementById('videoTitle');
  const qualitySelect = document.getElementById('qualitySelect');
  const downloadBtn = document.getElementById('downloadBtn');
  const openXdmBtn = document.getElementById('openXdmBtn');
  const alokpothBtn = document.getElementById('alokpothBtn');

  let engineOnline = false;
  let validHttpTab = false;

  const setButtonLabel = (text) => {
    downloadBtn.textContent = text;
  };

  // Check Engine Status
  chrome.runtime.sendMessage({ action: 'PING_XDM' }, (res) => {
    if (chrome.runtime.lastError || !res || !res.online) {
      engineOnline = false;
      statusBadge.className = 'status-badge status-offline';
      statusText.textContent = 'Engine Offline';
      downloadBtn.disabled = true;
    } else {
      engineOnline = true;
      statusBadge.className = 'status-badge status-online';
      statusText.textContent = 'Engine Active';
      downloadBtn.disabled = !validHttpTab;
    }
  });

  // Query Active Tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const tab = tabs && tabs[0];
  if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    validHttpTab = true;
    downloadBtn.disabled = !engineOnline;
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(tab.url);
    const cleanedTitle = (tab.title || '').replace(/\s*-\s*YouTube|\s*\|\s*Facebook/gi, '').trim();

    if (isVideoSite) {
      videoTitle.textContent = cleanedTitle || 'Video Stream Detected';
    } else {
      videoTitle.textContent = tab.title || tab.url;
    }

    downloadBtn.addEventListener('click', () => {
      downloadBtn.disabled = true;
      setButtonLabel('Starting Download...');

      chrome.runtime.sendMessage({
        action: 'START_DOWNLOAD',
        url: tab.url,
        payload: {
          url: tab.url,
          formatId: qualitySelect.value,
          title: cleanedTitle,
          autoStart: true
        }
      }, (res) => {
        if (chrome.runtime.lastError) {
          downloadBtn.disabled = false;
          setButtonLabel('Extension error — retry');
          setTimeout(() => setButtonLabel('Download Video with XDM'), 3000);
          return;
        }
        if (res && res.success) {
          setButtonLabel('Sent to XDM Turbo!');
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          downloadBtn.disabled = false;
          const msg = (res && res.error) ? res.error : 'Failed to send';
          setButtonLabel(msg);
          setTimeout(() => {
            setButtonLabel('Download Video with XDM');
          }, 3000);
        }
      });
    });
  } else {
    videoTitle.textContent = 'Open a webpage with media or video first.';
    downloadBtn.disabled = true;
  }

  openXdmBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://127.0.0.1:19684' });
  });

  if (alokpothBtn) {
    alokpothBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://alokpoth.zihan.xyz' });
    });
  }
});
