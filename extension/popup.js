document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const videoTitle = document.getElementById('videoTitle');
  const qualitySelect = document.getElementById('qualitySelect');
  const downloadBtn = document.getElementById('downloadBtn');
  const openXdmBtn = document.getElementById('openXdmBtn');

  // Check Engine Status
  chrome.runtime.sendMessage({ action: 'PING_XDM' }, (res) => {
    if (res && res.online) {
      statusBadge.className = 'status-badge status-online';
      statusText.textContent = 'Engine Active';
    } else {
      statusBadge.className = 'status-badge status-offline';
      statusText.textContent = 'Engine Offline';
      downloadBtn.disabled = true;
    }
  });

  // Query Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(tab.url);
    
    if (isVideoSite) {
      videoTitle.textContent = tab.title.replace(/\s*-\s*YouTube|\s*\|\s*Facebook/gi, '').trim() || 'Video Stream Detected';
    } else {
      videoTitle.textContent = tab.title || tab.url;
    }

    downloadBtn.addEventListener('click', () => {
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = '<span>Starting Download...</span>';

      chrome.runtime.sendMessage({
        action: 'START_DOWNLOAD',
        url: tab.url,
        payload: {
          url: tab.url,
          formatId: qualitySelect.value,
          title: tab.title.replace(/\s*-\s*YouTube|\s*\|\s*Facebook/gi, '').trim(),
          autoStart: true
        }
      }, (res) => {
        if (res && res.success) {
          downloadBtn.innerHTML = '<span>Sent to XDM Turbo!</span>';
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = '<span>Failed to send</span>';
        }
      });
    });
  }

  openXdmBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:19684' });
  });
});
