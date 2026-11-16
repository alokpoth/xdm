import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { DownloadRow } from './components/DownloadRow';
import { AddDownloadModal } from './components/AddDownloadModal';
import { DownloadDetailsModal } from './components/DownloadDetailsModal';
import { SettingsModal } from './components/SettingsModal';
import { BrowserIntegrationModal } from './components/BrowserIntegrationModal';
import { LicenseModal } from './components/LicenseModal';
import { UpdateModal } from './components/UpdateModal';
import { DownloadItem, GlobalStats, Settings, FileCategory, LicenseInfo } from './types';
import { 
  Download, 
  Inbox, 
  ClipboardList, 
  Power, 
  ArrowRight, 
  X, 
  Zap, 
  AlertTriangle, 
  ShieldAlert, 
  Lock,
  MessageCircle,
  Send,
  Copy,
  Check,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export const App: React.FC = () => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [stats, setStats] = useState<GlobalStats>({
    totalSpeed: 0,
    activeDownloads: 0,
    totalDownloads: 0,
    totalDownloaded: 0,
    totalSize: 0,
  });
  const [settings, setSettings] = useState<Settings>({
    defaultSaveDir: '',
    maxConcurrentDownloads: 3,
    defaultConnections: 64,
    autoStart: true,
    soundNotification: true,
    speedLimit: 0,
    categoriesDir: true,
    clipboardMonitoring: true,
    windowsNotifications: true,
    schedulerEnabled: false,
    scheduleStartTime: '01:00',
    scheduleStopTime: '06:00',
    shutdownOnCompletion: false
  });
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('xdm_theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('xdm_theme', next);
      if (next === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  const [currentFilter, setCurrentFilter] = useState<{ type: 'status' | 'category'; value: string }>({
    type: 'status',
    value: 'all',
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBrowserModalOpen, setIsBrowserModalOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);

  // Power Features State
  const [prefilledUrl, setPrefilledUrl] = useState<string>('');
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [shutdownWarning, setShutdownWarning] = useState<{ countdownSeconds: number; message: string } | null>(null);
  const [shutdownRemaining, setShutdownRemaining] = useState<number>(60);
  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseName?: string;
    releaseNotes?: string;
    downloadUrl?: string;
  } | null>(null);

  // Device Ban Lockdown State
  const [unbanKeyInput, setUnbanKeyInput] = useState('');
  const [unbanLoading, setUnbanLoading] = useState(false);
  const [checkingOnlineBan, setCheckingOnlineBan] = useState(false);
  const [unbanFeedback, setUnbanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedBanDeviceId, setCopiedBanDeviceId] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const seenCompletedIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef<boolean>(false);
  const errorToastTimerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const settingsRef = useRef<Settings>(settings);
  const licenseRef = useRef<LicenseInfo | null>(license);

  const showActionError = useCallback((message: string) => {
    setActionError(message);
    if (errorToastTimerRef.current) clearTimeout(errorToastTimerRef.current);
    errorToastTimerRef.current = setTimeout(() => {
      setActionError(null);
      errorToastTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    licenseRef.current = license;
  }, [license]);

  // Play audio chime
  const playCompletionSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        try { ctx.close(); } catch (e) {}
      };
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  // Connect WebSocket for live sub-second telemetry
  useEffect(() => {
    let isDisposed = false;
    let reconnectTimer: any = null;

    const connectWs = () => {
      if (isDisposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.port === '5173' 
        ? '127.0.0.1:19684' 
        : (window.location.host || '127.0.0.1:19684');
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (isDisposed) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'INIT') {
            const initialDownloads = msg.payload.downloads || [];
            setDownloads(initialDownloads);
            if (msg.payload.settings) setSettings(msg.payload.settings);
            if (msg.payload.stats) setStats(msg.payload.stats);
            if (msg.payload.license) setLicense(msg.payload.license);
            seenCompletedIdsRef.current = new Set(
              initialDownloads.filter((d: any) => d.status === 'completed').map((d: any) => d.id)
            );
            hasInitializedRef.current = true;
          } else if (msg.type === 'TELEMETRY') {
            const newDownloads: DownloadItem[] = msg.payload.downloads || [];
            setDownloads(newDownloads);
            if (msg.payload.stats) setStats(msg.payload.stats);
            if (msg.payload.license) {
              setLicense((prev) => {
                if (!prev) return msg.payload.license;
                const next = msg.payload.license;
                if (
                  prev.status === next.status &&
                  prev.isPro === next.isPro &&
                  prev.isAdmin === next.isAdmin &&
                  prev.isBanned === next.isBanned &&
                  prev.maskedKey === next.maskedKey &&
                  prev.fullKey === next.fullKey &&
                  prev.expiresAt === next.expiresAt &&
                  prev.customerName === next.customerName &&
                  prev.offlineGraceRemainingHours === next.offlineGraceRemainingHours
                ) {
                  return prev;
                }
                return next;
              });
            }

            // Detect newly completed downloads by unique ID rather than total count
            const completedDownloads = newDownloads.filter(d => d.status === 'completed');
            const newlyCompleted = hasInitializedRef.current
              ? completedDownloads.filter(d => !seenCompletedIdsRef.current.has(d.id))
              : [];
            seenCompletedIdsRef.current = new Set(completedDownloads.map(d => d.id));

            if (newlyCompleted.length > 0) {
              if (settingsRef.current.soundNotification) playCompletionSound();

              // Windows Native Toast Notification (PRO ONLY)!
              const isUserPro = Boolean(
                licenseRef.current?.isPro ||
                licenseRef.current?.isAdmin ||
                licenseRef.current?.status === 'pro' ||
                licenseRef.current?.status === 'grace' ||
                licenseRef.current?.status === 'active' ||
                licenseRef.current?.edition === 'pro'
              );
              if (isUserPro && settingsRef.current.windowsNotifications !== false && typeof window !== 'undefined' && (window as any).electronAPI?.showNotification) {
                const latestFinished = newlyCompleted[newlyCompleted.length - 1];
                (window as any).electronAPI.showNotification({
                  title: 'Download Completed',
                  body: latestFinished ? latestFinished.fileName : 'File downloaded successfully',
                  filePath: latestFinished ? latestFinished.filePath : undefined
                });
              }
            }
          } else if (msg.type === 'SETTINGS_UPDATE') {
            if (msg.payload) setSettings(msg.payload);
          } else if (msg.type === 'LICENSE_UPDATE') {
            if (msg.payload) setLicense(msg.payload);
          } else if (msg.type === 'DEVICE_BANNED') {
            setLicense(prev => ({
              ...(prev || {
                isPro: false,
                status: 'banned',
                maskedKey: '',
                fullKey: '',
                customerName: 'Banned Device',
                issuer: 'XDM Security'
              }),
              isBanned: true,
              status: 'banned',
              banReason: msg.payload?.reason || 'Administrative hardware ban',
              deviceId: msg.payload?.deviceId || prev?.deviceId
            }));
          } else if (msg.type === 'DEVICE_UNBANNED') {
            setLicense(prev => ({
              ...(prev || {
                isPro: false,
                maskedKey: '',
                fullKey: '',
                customerName: '',
                issuer: 'XDM Security'
              }),
              isBanned: false,
              status: 'free',
              banReason: null
            }));
          } else if (msg.type === 'SHUTDOWN_WARNING') {
            if (msg.payload) {
              setShutdownWarning(msg.payload);
              setShutdownRemaining(msg.payload.countdownSeconds || 60);
            }
          } else if (msg.type === 'SHUTDOWN_CANCELLED') {
            setShutdownWarning(null);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        if (!isDisposed) {
          reconnectTimer = setTimeout(connectWs, 2000);
        }
      };
    };

    connectWs();

    // Fetch initial settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => { if (!isDisposed) setSettings(data); })
      .catch(() => {});

    // Fetch initial license
    fetch('/api/license')
      .then(res => res.json())
      .then(data => { if (!isDisposed) setLicense(data); })
      .catch(() => {});

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Auto-Shutdown Countdown Timer
  useEffect(() => {
    if (!shutdownWarning) return;
    const interval = setInterval(() => {
      setShutdownRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [shutdownWarning]);

  const handleCancelShutdown = async () => {
    try {
      await fetch('/api/shutdown/cancel', { method: 'POST' });
    } catch (e) {}
    setShutdownWarning(null);
  };

  // Clipboard monitor listener (PRO ONLY)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onClipboardUrlDetected) {
      const unsub = (window as any).electronAPI.onClipboardUrlDetected((data: { url: string }) => {
        if (licenseRef.current?.isBanned || licenseRef.current?.status === 'banned') return;
        const isUserPro = Boolean(
          licenseRef.current?.isPro ||
          licenseRef.current?.isAdmin ||
          licenseRef.current?.status === 'pro' ||
          licenseRef.current?.status === 'grace' ||
          licenseRef.current?.status === 'active' ||
          licenseRef.current?.edition === 'pro'
        );
        if (isUserPro && data && data.url && settingsRef.current.clipboardMonitoring !== false) {
          setClipboardUrl(data.url);
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  // Tray action listener
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onTrayOpenAddModal) {
      const unsub = (window as any).electronAPI.onTrayOpenAddModal(() => {
        if (licenseRef.current?.isBanned || licenseRef.current?.status === 'banned') return;
        setIsAddModalOpen(true);
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  // In-App update check
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/check-update')
        .then(res => res.json())
        .then(data => {
          if (data && data.updateAvailable) {
            setUpdateInfo(data);
          }
        })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Global Desktop Shortcut: Ctrl+V (paste link anywhere) or Ctrl+N (new download)
  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      if (licenseRef.current?.isBanned || licenseRef.current?.status === 'banned') return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !isAddModalOpen) {
        try {
          const text = await navigator.clipboard?.readText();
          if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
            e.preventDefault();
            setPrefilledUrl(text.trim());
            setIsAddModalOpen(true);
          }
        } catch (err) {}
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !isAddModalOpen) {
        e.preventDefault();
        setPrefilledUrl('');
        setIsAddModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isAddModalOpen]);

  // Actions wrapped in useCallback to prevent re-creation and click latency
  const handleAddDownload = useCallback(async (options: {
    url: string;
    fileName: string;
    connections: number;
    saveDir: string;
    autoStart: boolean;
    category?: string;
    formatId?: string;
  }) => {
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(options.url);
    const hasFormat = options.formatId && (options.formatId.includes('best') || options.formatId.includes('audio') || options.formatId.includes('height'));
    
    const endpoint = (isVideoSite || hasFormat) ? '/api/video/download' : '/api/downloads';
    const body = (isVideoSite || hasFormat)
      ? {
          url: options.url,
          formatId: options.formatId || 'best',
          title: options.fileName,
          saveDir: options.saveDir,
          connections: options.connections || 64
        }
      : options;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start download');
  }, []);

  const postEngineAction = useCallback(async (url: string, method: 'POST' | 'DELETE' = 'POST', fallbackError = 'Action failed') => {
    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showActionError(data.error || data.message || fallbackError);
        return false;
      }
      return true;
    } catch (err: any) {
      showActionError(err?.message || fallbackError);
      return false;
    }
  }, [showActionError]);

  const handlePause = useCallback(async (id: string) => {
    await postEngineAction(`/api/downloads/${id}/pause`, 'POST', 'Failed to pause download');
  }, [postEngineAction]);

  const handleResume = useCallback(async (id: string) => {
    await postEngineAction(`/api/downloads/${id}/resume`, 'POST', 'Failed to resume download');
  }, [postEngineAction]);

  const handleRestart = useCallback(async (id: string) => {
    await postEngineAction(`/api/downloads/${id}/restart`, 'POST', 'Failed to restart download');
  }, [postEngineAction]);

  const handleDelete = useCallback(async (id: string, deleteFile = false) => {
    await postEngineAction(`/api/downloads/${id}?deleteFile=${deleteFile}`, 'DELETE', 'Failed to delete download');
  }, [postEngineAction]);

  const handleOpenFile = useCallback(async (id: string, filePath?: string) => {
    if (filePath && typeof window !== 'undefined' && (window as any).electronAPI?.openPath) {
      await (window as any).electronAPI.openPath(filePath);
      return;
    }
    await postEngineAction(`/api/downloads/${id}/open`, 'POST', 'File not found on disk');
  }, [postEngineAction]);

  const handleOpenFolder = useCallback(async (id: string, filePath?: string) => {
    if (filePath && typeof window !== 'undefined' && (window as any).electronAPI?.showItemInFolder) {
      await (window as any).electronAPI.showItemInFolder(filePath);
      return;
    }
    await postEngineAction(`/api/downloads/${id}/open-folder`, 'POST', 'Target folder unavailable');
  }, [postEngineAction]);

  const handlePauseAll = useCallback(async () => {
    await postEngineAction('/api/downloads/pause-all', 'POST', 'Failed to pause all downloads');
  }, [postEngineAction]);

  const handleResumeAll = useCallback(async () => {
    await postEngineAction('/api/downloads/resume-all', 'POST', 'Failed to resume all downloads');
  }, [postEngineAction]);

  const handleClearFinished = useCallback(async () => {
    await postEngineAction('/api/downloads/clear-finished', 'POST', 'Failed to clear finished tasks');
  }, [postEngineAction]);

  const handleOpenAddModal = useCallback(() => {
    setPrefilledUrl('');
    setIsAddModalOpen(true);
  }, []);

  const handleCloseAddModal = useCallback(() => {
    setIsAddModalOpen(false);
    setPrefilledUrl('');
  }, []);

  const handleOpenSettingsModal = useCallback(() => setIsSettingsModalOpen(true), []);
  const handleCloseSettingsModal = useCallback(() => setIsSettingsModalOpen(false), []);
  const handleOpenBrowserModal = useCallback(() => setIsBrowserModalOpen(true), []);
  const handleCloseBrowserModal = useCallback(() => setIsBrowserModalOpen(false), []);
  const handleOpenLicenseModal = useCallback(() => setIsLicenseModalOpen(true), []);
  const handleCloseLicenseModal = useCallback(() => setIsLicenseModalOpen(false), []);
  const handleCloseDetailsModal = useCallback(() => setInspectedItemId(null), []);
  const handleOpenUpdateModal = useCallback(() => setIsUpdateModalOpen(true), []);
  const handleCloseUpdateModal = useCallback(() => setIsUpdateModalOpen(false), []);
  const handleDownloadUpdateUrl = useCallback((url: string) => {
    setPrefilledUrl(url);
    setIsAddModalOpen(true);
  }, []);

  const handleSaveSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    const data = await res.json();
    setSettings(data);
  }, []);

  const handleSpeedLimitChange = useCallback(async (limit: number) => {
    await handleSaveSettings({ speedLimit: limit });
  }, [handleSaveSettings]);

  const handleActivateLicense = useCallback(async (key: string, name?: string, email?: string) => {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, customerName: name, email })
    });
    const data = await res.json();
    if (data.success && data.license) {
      setLicense(data.license);
    }
    return data;
  }, []);

  const handleDeactivateLicense = useCallback(async () => {
    const res = await fetch('/api/license/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      const statusRes = await fetch('/api/license');
      const statusData = await statusRes.json();
      setLicense(statusData);
    }
    return data;
  }, []);

  const handleUnbanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unbanKeyInput.trim()) {
      setUnbanFeedback({ type: 'error', message: 'Please enter an unban key or active PRO key.' });
      return;
    }
    setUnbanLoading(true);
    setUnbanFeedback(null);
    try {
      const res = await handleActivateLicense(unbanKeyInput.trim());
      if (res.success) {
        setUnbanFeedback({ type: 'success', message: res.message || 'Device ban lifted successfully! Engine restored.' });
        setUnbanKeyInput('');
        const licRes = await fetch('/api/license');
        const licData = await licRes.json();
        setLicense(licData);
      } else {
        setUnbanFeedback({ type: 'error', message: res.error || 'Invalid unban key or device verification rejected.' });
      }
    } catch (err: any) {
      setUnbanFeedback({ type: 'error', message: err.message || 'Network error while contacting license server.' });
    } finally {
      setUnbanLoading(false);
    }
  };

  const handleCheckOnlineUnban = async () => {
    setCheckingOnlineBan(true);
    setUnbanFeedback(null);
    try {
      const res = await fetch('/api/license/check-ban-status', { method: 'POST' });
      const data = await res.json();
      if (data.unbanned) {
        setUnbanFeedback({ type: 'success', message: 'Ban lifted by administrator! Application restored.' });
        const licRes = await fetch('/api/license');
        const licData = await licRes.json();
        setLicense(licData);
      } else if (data.isBanned) {
        setUnbanFeedback({ type: 'error', message: 'Appeal pending: This device is still marked as banned on the central license server. Contact @zihanfakir on WhatsApp or Telegram to appeal.' });
      }
    } catch (err: any) {
      setUnbanFeedback({ type: 'error', message: 'Could not contact license server. Check your internet connection.' });
    } finally {
      setCheckingOnlineBan(false);
    }
  };

  const handleCopyBanDeviceId = () => {
    const id = license?.deviceId || license?.hardwareId;
    if (id) {
      navigator.clipboard?.writeText(id);
      setCopiedBanDeviceId(true);
      setTimeout(() => setCopiedBanDeviceId(false), 2000);
    }
  };

  // Filter & Search Logic
  const filteredDownloads = downloads.filter((item) => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.fileName?.toLowerCase().includes(q);
      const matchUrl = item.url?.toLowerCase().includes(q);
      if (!matchName && !matchUrl) return false;
    }

    // Filter type
    if (currentFilter.type === 'status') {
      if (currentFilter.value === 'all') return true;
      if (currentFilter.value === 'downloading') {
        return item.status === 'downloading' || item.status === 'probing';
      }
      if (currentFilter.value === 'completed') return item.status === 'completed';
      if (currentFilter.value === 'paused') {
        return item.status === 'paused' || item.status === 'queued';
      }
      if (currentFilter.value === 'error') return item.status === 'error';
    } else if (currentFilter.type === 'category') {
      return item.category === currentFilter.value;
    }

    return true;
  });

  // Inspected Item
  const inspectedItem = downloads.find(d => d.id === inspectedItemId) || null;
  const handleInspect = useCallback((item: DownloadItem) => setInspectedItemId(item.id), []);

  // Active threads count (only downloading or connecting threads)
  const isBanned = Boolean(license?.isBanned || license?.status === 'banned');
  const isEffectivePro = Boolean(
    license?.isPro ||
    license?.isAdmin ||
    license?.status === 'pro' ||
    license?.status === 'grace' ||
    license?.status === 'active' ||
    license?.edition === 'pro' ||
    license?.edition === 'admin' ||
    license?.edition === 'trial' ||
    (license?.maskedKey && license.maskedKey.length > 5) ||
    (license?.fullKey && license.fullKey.length > 5)
  );
  const activeConnectionsCount = isBanned ? 0 : downloads
    .filter(d => d.status === 'downloading')
    .reduce((acc, d) => {
      const activeSegs = d.segments?.filter(s => s.status === 'downloading' || s.status === 'connecting').length;
      return acc + (activeSegs && activeSegs > 0 ? activeSegs : 1);
    }, 0);

  return (
    <div className="flex flex-col h-screen w-screen app-root-bg bg-[#0f1115] text-slate-100 overflow-hidden font-sans">
      {/* Title Bar */}
      <Titlebar activeConnectionsCount={activeConnectionsCount} />

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentFilter={currentFilter}
          onSelectFilter={setCurrentFilter}
          downloads={downloads}
          stats={stats}
          license={license}
          onOpenLicenseModal={handleOpenLicenseModal}
        />

        {/* Center Content Area */}
        <div className="flex-1 flex flex-col min-w-0 app-main-bg bg-[#0f1115] relative overflow-hidden">
          {/* Top Action Bar */}
          <TopNavbar
            onOpenAddModal={handleOpenAddModal}
            onOpenSettingsModal={handleOpenSettingsModal}
            onOpenBrowserModal={handleOpenBrowserModal}
            onOpenLicenseModal={handleOpenLicenseModal}
            license={license}
            onPauseAll={handlePauseAll}
            onResumeAll={handleResumeAll}
            onClearFinished={handleClearFinished}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            speedLimit={settings.speedLimit}
            onSpeedLimitChange={handleSpeedLimitChange}
            updateAvailable={Boolean(updateInfo?.updateAvailable)}
            onOpenUpdateModal={handleOpenUpdateModal}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Downloads List */}
          <main className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-2.5 relative z-10">
            {filteredDownloads.length > 0 ? (
              filteredDownloads.map((item) => (
                <DownloadRow
                  key={item.id}
                  item={item}
                  onPause={handlePause}
                  onResume={handleResume}
                  onRestart={handleRestart}
                  onDelete={handleDelete}
                  onOpenFile={handleOpenFile}
                  onOpenFolder={handleOpenFolder}
                  onInspect={handleInspect}
                />
              ))
            ) : (
              <div className="h-full min-h-[420px] flex items-center justify-center p-4 select-none">
                <div className="liquid-glass-card rounded-2xl p-8 max-w-sm w-full flex flex-col items-center text-center space-y-3.5 shadow-sm border relative">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Download className="w-7 h-7 stroke-[1.75]" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white theme-text-primary tracking-tight">No Active Downloads</h3>
                    <p className="text-xs text-slate-400 theme-text-secondary leading-relaxed">
                      Paste any link or file URL to start downloading.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2.5 pt-1 w-full justify-center">
                    <button
                      onClick={() => {
                        setPrefilledUrl('');
                        setIsAddModalOpen(true);
                      }}
                      className="btn-emerald-glow px-4 py-2 text-xs font-semibold cursor-pointer"
                    >
                      + Add Download Link
                    </button>
                    <button
                      onClick={() => setIsBrowserModalOpen(true)}
                      className="theme-secondary-btn px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      Extension Setup
                    </button>
                  </div>

                  <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 theme-text-secondary pt-2 border-t border-white/[0.06] theme-border-subtle w-full justify-center">
                    <span>Quick Tip: Press</span>
                    <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] theme-kbd border border-white/[0.1] text-[10px] font-sans">Ctrl</kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.08] theme-kbd border border-white/[0.1] text-[10px] font-sans">V</kbd>
                    <span>to quickly paste</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating Clipboard Link Detected Toast */}
      {clipboardUrl && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-2xl liquid-modal-panel border border-violet-500/40 shadow-[0_8px_32px_rgba(139,92,246,0.25)] flex items-start space-x-3.5 backdrop-blur-2xl animate-slideInUp select-none">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-500/25 to-purple-500/10 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0 mt-0.5 shadow-[0_0_12px_rgba(139,92,246,0.2)]">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-violet-400 font-mono tracking-wide">Clipboard Link Detected</span>
              <button
                onClick={() => setClipboardUrl(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-200 theme-text-primary truncate font-mono mt-1 bg-black/30 px-2 py-1 rounded-lg border border-white/[0.05]">{clipboardUrl}</p>
            <div className="flex items-center space-x-2 mt-3">
              <button
                onClick={() => {
                  setPrefilledUrl(clipboardUrl);
                  setIsAddModalOpen(true);
                  setClipboardUrl(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black text-xs font-extrabold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)] active:scale-95"
              >
                <span>Download Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setClipboardUrl(null)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-all cursor-pointer border border-white/[0.06]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Shutdown Warning Countdown Banner */}
      {shutdownWarning && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4">
          <div className="p-3.5 rounded-2xl bg-red-950/95 border border-red-500 shadow-2xl flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-mono font-bold text-sm">
                {shutdownRemaining}s
              </div>
              <div>
                <h4 className="text-xs font-bold text-red-200">PC Auto-Shutdown Imminent</h4>
                <p className="text-[10px] text-red-300/80">All downloads completed. Shutting down in {shutdownRemaining}s.</p>
              </div>
            </div>
            <button
              onClick={handleCancelShutdown}
              className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-black font-bold text-xs shadow-lg shadow-red-500/30 cursor-pointer transition-all"
            >
              Cancel Shutdown
            </button>
          </div>
        </div>
      )}

      {/* Action Error Toast Banner */}
      {actionError && (
        <div className="fixed bottom-6 left-6 z-50 max-w-sm p-3.5 rounded-2xl bg-rose-950/95 border border-rose-500/60 shadow-2xl flex items-center space-x-3 backdrop-blur-xl animate-slideInUp select-none">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs font-medium text-rose-100 flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-300 hover:text-white p-1 rounded-md hover:bg-white/[0.08] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add Download Modal */}
      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={handleCloseAddModal}
        onAddDownload={handleAddDownload}
        defaultSaveDir={settings.defaultSaveDir}
        defaultConnections={settings.defaultConnections}
        initialUrl={prefilledUrl}
        isPro={isEffectivePro}
        onOpenLicenseModal={handleOpenLicenseModal}
      />

      {/* IDM Segment & Speed Inspector Modal */}
      <DownloadDetailsModal
        item={inspectedItem}
        onClose={handleCloseDetailsModal}
        onPause={handlePause}
        onResume={handleResume}
        onRestart={handleRestart}
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettingsModal}
        settings={settings}
        onSave={handleSaveSettings}
        isPro={isEffectivePro}
        license={license}
        onOpenLicenseModal={handleOpenLicenseModal}
      />

      {/* Browser Integration Modal */}
      <BrowserIntegrationModal
        isOpen={isBrowserModalOpen}
        onClose={handleCloseBrowserModal}
      />

      {/* License & Activation Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={handleCloseLicenseModal}
        license={license}
        onActivate={handleActivateLicense}
        onDeactivate={handleDeactivateLicense}
      />

      {/* In-App Auto-Update Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={handleCloseUpdateModal}
        updateInfo={updateInfo}
        onDownloadUpdate={handleDownloadUpdateUrl}
      />

      {/* Strict Device Ban Lockdown Fullscreen Screen */}
      {isBanned && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#060911]/98 backdrop-blur-2xl select-none animate-fadeIn">
          <div className="w-full max-w-xl rounded-3xl bg-[#0c101d] border border-rose-500/40 p-6 sm:p-8 shadow-[0_0_60px_rgba(244,63,94,0.25)] relative overflow-hidden flex flex-col space-y-5 text-center">
            {/* Glowing red accent blur */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Icon & Status */}
            <div className="flex flex-col items-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/30 animate-pulse">
                <ShieldAlert className="w-9 h-9 stroke-[1.75]" />
              </div>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                <Lock className="w-3.5 h-3.5" />
                <span>DEVICE HARDWARE ACCESS TERMINATED</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                DEVICE ACCESS PERMANENTLY BANNED
              </h2>
              <p className="text-xs text-rose-200/90 max-w-md leading-relaxed">
                এই ডিভাইসের হার্ডওয়্যার আইডি সিকিউরিটি পলিসি লঙ্ঘনের কারণে স্থায়ীভাবে নিষিদ্ধ করা হয়েছে। সকল ডাউনলোড ইঞ্জিন, নেটওয়ার্ক সকেট ও ব্রাউজার ইন্টিগ্রেশন সম্পূর্ণরূপে বন্ধ রয়েছে।
              </p>
            </div>

            {/* Hardware Device ID Card */}
            <div className="rounded-2xl p-3.5 bg-slate-950/80 border border-rose-500/30 text-left space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Hardware Device ID:</span>
                <button
                  type="button"
                  onClick={handleCopyBanDeviceId}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] font-mono transition-all border border-rose-500/30 cursor-pointer active:scale-95"
                >
                  {copiedBanDeviceId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedBanDeviceId ? 'Copied' : 'Copy ID'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-rose-300 bg-black/60 px-3 py-2 rounded-xl border border-rose-500/20 select-all truncate">
                {license?.deviceId || license?.hardwareId || 'Generating Device ID...'}
              </div>
              <div className="text-[11px] text-slate-400">
                <span className="font-semibold text-rose-400">Ban Reason: </span>
                <span>{license?.banReason || 'Administrative hardware ban / Unauthorized tampering detected'}</span>
              </div>
            </div>

            {/* Online Server Unban Verification Button */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCheckOnlineUnban}
                disabled={checkingOnlineBan}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingOnlineBan ? 'animate-spin' : ''}`} />
                <span>{checkingOnlineBan ? 'Querying Central License Server...' : 'Check Appeal / Unban Status Online'}</span>
              </button>
              <p className="text-[10px] text-slate-500 font-mono">
                Click above after Zihan Fakir unbans your Device ID on the central license server.
              </p>
            </div>

            {/* Offline Signed Unban Certificate / License Activation Input */}
            <form onSubmit={handleUnbanSubmit} className="space-y-2.5 text-left">
              <label className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                Or Enter Signed Unban Certificate / PRO Key
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Paste signed unban token or authorized license key"
                  value={unbanKeyInput}
                  onChange={(e) => setUnbanKeyInput(e.target.value.trim())}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-rose-500/30 focus:border-rose-500 focus:outline-none text-white font-mono text-xs placeholder-slate-600 truncate"
                />
                <button
                  type="submit"
                  disabled={unbanLoading}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition-all disabled:opacity-40 flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-rose-600/30 active:scale-95 shrink-0"
                >
                  {unbanLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{unbanLoading ? 'Verifying...' : 'Verify Certificate'}</span>
                </button>
              </div>
              {unbanFeedback && (
                <div className={`p-2.5 rounded-xl text-xs font-medium border flex items-center space-x-2 ${
                  unbanFeedback.type === 'success' 
                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' 
                    : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                }`}>
                  {unbanFeedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{unbanFeedback.message}</span>
                </div>
              )}
            </form>

            {/* Appeal / Contact Administrator */}
            <div className="pt-2 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">Appeal to Zihan Fakir:</span>
              <div className="flex items-center gap-2">
                <a
                  href="https://wa.me/zihanfakir"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = 'https://wa.me/zihanfakir';
                    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-[11px] font-mono transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp: @zihanfakir</span>
                </a>
                <a
                  href="https://t.me/zihanfakir"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = 'https://t.me/zihanfakir';
                    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600/90 hover:bg-cyan-500 text-white font-bold text-[11px] font-mono transition-all flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Telegram: @zihanfakir</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
