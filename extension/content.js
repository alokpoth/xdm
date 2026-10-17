// XDM Turbo Content Script - IDM-style Video Grabber & Download Sniffer

(function() {
  'use strict';

  const DOWNLOAD_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.exe', '.msi', '.apk', '.mp4', '.mkv', '.mp3', '.pdf'];

  // Intercept normal download link clicks
  document.addEventListener('click', function(e) {
    let target = e.target.closest('a');
    if (!target || !target.href) return;

    const url = target.href;
    const isDownload = DOWNLOAD_EXTS.some(ext => url.toLowerCase().split('?')[0].endsWith(ext));

    if (isDownload) {
      e.preventDefault();
      e.stopPropagation();

      chrome.runtime.sendMessage({
        action: 'START_DOWNLOAD',
        payload: { url, autoStart: true }
      }, (res) => {
        if (res && res.success) {
          showToast('🚀 Sent to XDM Turbo: ' + url.split('/').pop());
        } else {
          // If engine is offline, fall back to default browser download
          window.location.href = url;
        }
      });
    }
  }, true);

  // Floating Toast notification
  function showToast(message) {
    let toast = document.getElementById('xdm-floating-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'xdm-floating-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'xdm-toast-show';
    setTimeout(() => {
      toast.className = '';
    }, 3500);
  }

  // IDM Video Grabber: Inject floating download bar on video players
  function setupVideoGrabber() {
    const videos = document.querySelectorAll('video');

    videos.forEach((video) => {
      // Skip tiny preview thumbnails or hidden audio players
      if ((video.offsetWidth > 0 && video.offsetWidth < 160) || (video.offsetHeight > 0 && video.offsetHeight < 100)) {
        return;
      }

      const playerContainer = video.closest('.html5-video-player') || 
                              video.closest('[data-video-id]') || 
                              video.closest('.video-js') ||
                              video.parentElement;

      if (!playerContainer) return;
      if (playerContainer.querySelector('.xdm-video-panel')) return; // already attached to container

      // Position relative if static
      const computedPos = window.getComputedStyle(playerContainer).position;
      if (computedPos === 'static') {
        playerContainer.style.position = 'relative';
      }

      // Create IDM-style floating panel
      const panel = document.createElement('div');
      panel.className = 'xdm-video-panel';
      panel.innerHTML = `
        <div class="xdm-panel-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Video</span>
        </div>
        <div class="xdm-panel-menu">
          <div class="xdm-menu-header">XDM Turbo Video Grabber</div>
          <button class="xdm-opt-btn" data-quality="best">
            <span>🎬 Best Quality (Auto 1080p/720p)</span>
            <span class="xdm-badge">MP4</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=1080]+bestaudio/best[height<=1080]">
            <span>🎬 1080p Full HD</span>
            <span class="xdm-badge">FHD</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=720]+bestaudio/best[height<=720]">
            <span>🎬 720p HD</span>
            <span class="xdm-badge">HD</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=480]+bestaudio/best[height<=480]">
            <span>🎬 480p Standard</span>
            <span class="xdm-badge">SD</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestaudio/best">
            <span>🎵 Audio Only</span>
            <span class="xdm-badge">MP3</span>
          </button>
        </div>
      `;

      // Click to toggle menu
      const btn = panel.querySelector('.xdm-panel-btn');
      const menu = panel.querySelector('.xdm-panel-menu');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        menu.classList.toggle('xdm-menu-open');
      });

      // Handle download option click
      panel.querySelectorAll('.xdm-opt-btn').forEach((optBtn) => {
        optBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          menu.classList.remove('xdm-menu-open');

          const formatId = optBtn.getAttribute('data-quality');
          const currentUrl = window.location.href;
          const pageTitle = document.title.replace(/\s*-\s*YouTube|\s*\|\s*Facebook/gi, '').trim();

          btn.innerHTML = `<span>⏳ Requesting...</span>`;

          chrome.runtime.sendMessage({
            action: 'START_DOWNLOAD',
            url: currentUrl,
            payload: {
              url: currentUrl,
              formatId,
              title: pageTitle,
              autoStart: true
            }
          }, (res) => {
            if (res && res.success) {
              btn.innerHTML = `<span>✓ Sent to XDM</span>`;
              showToast(`🚀 "${pageTitle}" sent to XDM Turbo!`);
              setTimeout(() => {
                btn.innerHTML = `
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>Download Video</span>
                `;
              }, 2500);
            } else {
              showToast(`⚠️ Please ensure XDM Turbo is running on your PC`);
            }
          });
        });
      });

      // Close menu if clicked outside
      document.addEventListener('click', () => {
        menu.classList.remove('xdm-menu-open');
      });

      playerContainer.appendChild(panel);
    });
  }

  // Monitor DOM for new videos (Single Page Apps like YouTube and Facebook dynamically insert video tags)
  setInterval(setupVideoGrabber, 1500);
  setupVideoGrabber();
})();
