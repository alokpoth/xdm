// XDM Turbo Content Script - IDM-style Video Grabber & Download Sniffer

(function() {
  'use strict';

  const DOWNLOAD_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.exe', '.msi', '.apk', '.dmg', '.pkg', '.mp4', '.mkv', '.avi', '.mov', '.mp3', '.flac', '.wav', '.pdf', '.epub'];

  let isProUser = false;
  let licenseChecked = false;

  function refreshLicenseStatus(callback) {
    try {
      chrome.runtime.sendMessage({ action: 'GET_LICENSE_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          isProUser = false;
        } else {
          isProUser = Boolean(res.isPro);
        }
        licenseChecked = true;
        if (!isProUser) {
          // Free mode: strictly remove all video panels from DOM
          document.querySelectorAll('.xdm-video-panel').forEach(p => p.remove());
        }
        if (callback) callback(isProUser);
      });
    } catch (e) {
      isProUser = false;
    }
  }

  // Initial license state query and periodic refresh
  refreshLicenseStatus();
  setInterval(() => refreshLicenseStatus(), 20000);

  // Intercept normal download link clicks strictly (PRO ONLY)
  document.addEventListener('click', function(e) {
    // If not PRO, free version extension is OFF: let browser handle all clicks naturally
    if (!isProUser) return;

    // Security: Only capture genuine user gestures, ignoring synthetic click events
    if (!e.isTrusted) return;

    // If user holds Ctrl, Shift, or Alt, do not hijack click
    if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;

    let target = e.target.closest('a');
    if (!target || !target.href) return;

    const href = target.href;
    if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) return;

    try {
      const parsed = new URL(href, window.location.href);
      const pathname = parsed.pathname.toLowerCase();
      const isDownload = DOWNLOAD_EXTS.some(ext => pathname.endsWith(ext)) || target.hasAttribute('download');

      if (isDownload) {
        e.preventDefault();
        e.stopPropagation();

        chrome.runtime.sendMessage({
          action: 'START_DOWNLOAD',
          payload: { url: href, autoStart: true }
        }, (res) => {
          if (res && res.success) {
            showToast('Sent to XDM Turbo: ' + (pathname.split('/').pop() || href));
          } else {
            // If pro required or offline, let browser handle the download
            window.location.href = href;
          }
        });
      }
    } catch (err) {}
  }, true);

  // Floating Toast notification (safe DOM textContent to prevent DOM XSS)
  function showToast(message) {
    let toast = document.getElementById('xdm-floating-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'xdm-floating-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '';
    const flex = document.createElement('div');
    flex.style.display = 'flex';
    flex.style.alignItems = 'center';
    flex.style.gap = '8px';

    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="#34d399" stroke-width="2.5" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';

    const textSpan = document.createElement('span');
    textSpan.textContent = String(message || '');

    flex.appendChild(iconSpan);
    flex.appendChild(textSpan);
    toast.appendChild(flex);

    toast.className = 'xdm-toast-show';
    setTimeout(() => {
      toast.className = '';
    }, 3500);
  }

  // IDM Video Grabber: Inject floating download bar on video players
  function setupVideoGrabber() {
    if (!isProUser) {
      // Free mode: video grabber is turned off
      document.querySelectorAll('.xdm-video-panel').forEach(p => p.remove());
      return;
    }

    const videos = document.querySelectorAll('video');

    videos.forEach((video) => {
      // Skip tiny preview thumbnails or hidden audio players
      if ((video.offsetWidth > 0 && video.offsetWidth < 160) || (video.offsetHeight > 0 && video.offsetHeight < 100)) {
        return;
      }

      // Check if user clicked "Close for this time" on this specific video/URL
      if (video.dataset.xdmDismissed === window.location.href) {
        return;
      }

      // For YouTube Shorts, only attach to active reel card to prevent jitter / jumping
      const reelCard = video.closest('ytd-reel-video-renderer');
      if (reelCard && !reelCard.hasAttribute('is-active')) {
        return;
      }

      // Container hierarchy:
      // For YouTube Shorts: ytd-reel-video-renderer is the top-level card that holds both the player and the #overlay
      // For standard YouTube: .html5-video-player holds the video and stays active in fullscreen
      // Fallbacks: [data-video-id], .video-js, or video.parentElement
      const playerContainer = reelCard || 
                              video.closest('.html5-video-player') || 
                              video.closest('div[role="dialog"]') ||
                              video.closest('[data-video-id]') || 
                              video.closest('.video-js') ||
                              video.parentElement;

      if (!playerContainer) return;

      const existingPanel = playerContainer.querySelector('.xdm-video-panel');
      if (existingPanel && existingPanel.isConnected) {
        // Panel is already securely mounted and connected.
        // Never re-append to prevent layout thrashing and DOM jitter.
        return;
      }

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
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-zap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span>Best Quality (Auto Max)</span>
            </span>
            <span class="xdm-badge xdm-badge-auto">AUTO</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=2160][fps>=50]+bestaudio/bestvideo[height<=2160]+bestaudio/best">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-4k" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
              <span>4K 60fps Ultra HD</span>
            </span>
            <span class="xdm-badge xdm-badge-4k">4K</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=1440][fps>=50]+bestaudio/bestvideo[height<=1440]+bestaudio/best">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-2k" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
              <span>2K 60fps QHD</span>
            </span>
            <span class="xdm-badge xdm-badge-2k">2K</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=1080][fps>=50]+bestaudio/bestvideo[height<=1080]+bestaudio/best">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-fhd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
              <span>1080p Full HD (60fps)</span>
            </span>
            <span class="xdm-badge xdm-badge-fhd">FHD</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=720]+bestaudio/best[height<=720]">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-hd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              <span>720p HD</span>
            </span>
            <span class="xdm-badge xdm-badge-hd">HD</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestvideo[height<=480]+bestaudio/best[height<=480]">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-sd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              <span>480p Standard</span>
            </span>
            <span class="xdm-badge xdm-badge-sd">SD</span>
          </button>
          <button class="xdm-opt-btn" data-quality="bestaudio/best">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-audio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              <span>Audio Only (MP3 320k)</span>
            </span>
            <span class="xdm-badge xdm-badge-mp3">MP3</span>
          </button>
          <div class="xdm-menu-divider"></div>
          <button class="xdm-opt-btn xdm-opt-close" data-action="close">
            <span class="xdm-opt-label">
              <svg class="xdm-opt-icon xdm-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <span>Close for this time</span>
            </span>
          </button>
        </div>
      `;

      // Playback Lock: Prevent any parent site (Instagram, Facebook, YouTube) from pausing video when clicking XDM
      let keepPlayingLock = false;
      let lockTimer = null;

      const armPlaybackLock = () => {
        if (!video.paused) {
          keepPlayingLock = true;
          if (lockTimer) clearTimeout(lockTimer);
          lockTimer = setTimeout(() => {
            keepPlayingLock = false;
          }, 800);
        }
      };

      // Aggressively prevent pause during XDM interaction
      video.addEventListener('pause', () => {
        if (keepPlayingLock) {
          video.play().catch(() => {});
        }
      }, true);

      // Click to toggle menu
      const btn = panel.querySelector('.xdm-panel-btn');
      const menu = panel.querySelector('.xdm-panel-menu');

      const stopAll = (e) => {
        armPlaybackLock();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.type !== 'click') {
          e.preventDefault();
        }
      };

      // Intercept every possible pointer/mouse event on both panel and button
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'].forEach((evt) => {
        btn.addEventListener(evt, stopAll, true);
        panel.addEventListener(evt, stopAll, true);
      });

      const toggleMenu = (e) => {
        armPlaybackLock();
        if (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
        }

        const isCurrentlyOpen = menu.classList.contains('xdm-menu-open');
        if (!isCurrentlyOpen) {
          // Dynamic boundary calculation: prevent any overflow clipping in narrow containers
          try {
            const containerRect = playerContainer.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const availableWidth = containerRect.width;

            if (availableWidth > 0 && availableWidth < 260) {
              const fittedWidth = Math.max(180, Math.floor(availableWidth - 16));
              menu.style.setProperty('width', `${fittedWidth}px`, 'important');
              menu.style.setProperty('right', '0px', 'important');
              menu.style.setProperty('left', 'auto', 'important');
            } else {
              menu.style.setProperty('width', '240px', 'important');
              // Check if 240px extending to the left from panelRect.right exceeds container's left border
              if (panelRect.right - 240 < containerRect.left + 8) {
                menu.style.setProperty('right', 'auto', 'important');
                menu.style.setProperty('left', '0px', 'important');
              } else {
                menu.style.setProperty('right', '0px', 'important');
                menu.style.setProperty('left', 'auto', 'important');
              }
            }
          } catch (err) {}

          menu.classList.add('xdm-menu-open');
        } else {
          menu.classList.remove('xdm-menu-open');
        }

        // Instant resume guarantee if anything tried to pause
        if (keepPlayingLock && video.paused) {
          video.play().catch(() => {});
        }
      };

      btn.addEventListener('click', toggleMenu, true);

      // Handle "Close for this time" dismissal
      const dismissGrabber = (e) => {
        armPlaybackLock();
        if (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
        }
        video.dataset.xdmDismissed = window.location.href;
        panel.remove();
        if (keepPlayingLock && video.paused) {
          video.play().catch(() => {});
        }
      };

      const menuClose = panel.querySelector('.xdm-opt-close');
      if (menuClose) {
        menuClose.addEventListener('click', dismissGrabber, true);
        menuClose.addEventListener('pointerdown', stopAll, true);
        menuClose.addEventListener('mousedown', stopAll, true);
        menuClose.addEventListener('mouseup', stopAll, true);
      }

      // Handle download option click
      panel.querySelectorAll('.xdm-opt-btn').forEach((optBtn) => {
        if (optBtn.getAttribute('data-action') === 'close') return;

        const handleSelect = (e) => {
          armPlaybackLock();
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
          menu.classList.remove('xdm-menu-open');

          if (keepPlayingLock && video.paused) {
            video.play().catch(() => {});
          }

          const formatId = optBtn.getAttribute('data-quality');
          const currentUrl = window.location.href;
          const pageTitle = document.title.replace(/\s*-\s*YouTube|\s*\|\s*Facebook|\s*\|\s*Instagram/gi, '').trim() || 'Video Download';

          // 1. Extract direct video source from <video>
          let directSrc = null;
          if (video.src && video.src.startsWith('http')) {
            directSrc = video.src;
          } else if (video.currentSrc && video.currentSrc.startsWith('http')) {
            directSrc = video.currentSrc;
          } else {
            const srcTag = video.querySelector('source[src^="http"]');
            if (srcTag && srcTag.src) directSrc = srcTag.src;
          }

          // 2. On Instagram, find the specific post or reel permalink if available
          let resolvedUrl = currentUrl;
          if (/instagram\.com/i.test(currentUrl)) {
            const article = video.closest('article') || video.closest('div[role="dialog"]') || video.closest('div[role="presentation"]');
            const link = article ? article.querySelector('a[href*="/reel/"], a[href*="/p/"]') : null;
            if (link && link.href) {
              resolvedUrl = link.href;
            }
          }

          btn.innerHTML = `
            <svg class="xdm-spin" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span>Requesting...</span>
          `;

          chrome.runtime.sendMessage({
            action: 'START_DOWNLOAD',
            url: resolvedUrl,
            payload: {
              url: resolvedUrl,
              directUrl: directSrc,
              formatId,
              title: pageTitle,
              autoStart: true
            }
          }, (res) => {
            if (res && res.success) {
              btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Sent to XDM</span>
              `;
              showToast(`"${pageTitle}" sent to XDM Turbo!`);
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
              const errMsg = (res && res.error) ? res.error : 'Please ensure XDM Turbo is running on your PC';
              showToast(errMsg);
              btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Download Video</span>
              `;
            }
          });
        };

        optBtn.addEventListener('click', handleSelect, true);
        optBtn.addEventListener('pointerdown', stopAll, true);
        optBtn.addEventListener('mousedown', stopAll, true);
        optBtn.addEventListener('pointerup', stopAll, true);
        optBtn.addEventListener('mouseup', stopAll, true);
      });

      playerContainer.appendChild(panel);
    });
  }

  // Close grabber menu if clicked outside
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.xdm-video-panel')) {
      return;
    }
    document.querySelectorAll('.xdm-panel-menu.xdm-menu-open').forEach((menu) => {
      menu.classList.remove('xdm-menu-open');
    });
  }, true);

  // Monitor DOM for new videos (Single Page Apps like YouTube and Facebook dynamically insert video tags)
  let grabberDebounce = null;
  const triggerGrabber = (mutationsList) => {
    if (mutationsList && mutationsList.length) {
      // Filter out internal mutations from XDM to prevent feedback loops
      let hasExternalVideoMutation = false;
      for (let i = 0; i < mutationsList.length; i++) {
        const m = mutationsList[i];
        if (m.target) {
          if (m.target.closest && m.target.closest('.xdm-video-panel')) continue;
          if (m.target.id === 'xdm-floating-toast' || (m.target.closest && m.target.closest('#xdm-floating-toast'))) continue;
        }
        if (m.addedNodes && m.addedNodes.length > 0) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node.nodeType === 1) {
              const tag = node.tagName;
              if (tag === 'VIDEO' || tag === 'YTD-WATCH-FLEXY' || tag === 'YTD-REEL-VIDEO-RENDERER' || (node.querySelector && node.querySelector('video'))) {
                hasExternalVideoMutation = true;
                break;
              }
            }
          }
        }
        if (hasExternalVideoMutation) break;
      }
      if (!hasExternalVideoMutation) return;
    }

    if (grabberDebounce) return;
    grabberDebounce = setTimeout(() => {
      grabberDebounce = null;
      setupVideoGrabber();
    }, 400);
  };

  const domObserver = new MutationObserver(triggerGrabber);
  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      domObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  setInterval(setupVideoGrabber, 4000);
  setupVideoGrabber();
})();
