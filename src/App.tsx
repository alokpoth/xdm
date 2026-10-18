import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { DownloadRow } from './components/DownloadRow';
import { AddDownloadModal } from './components/AddDownloadModal';
import { DownloadDetailsModal } from './components/DownloadDetailsModal';
import { SettingsModal } from './components/SettingsModal';
import { BrowserIntegrationModal } from './components/BrowserIntegrationModal';
import { LicenseModal } from './components/LicenseModal';
import { DownloadItem, GlobalStats, Settings, FileCategory, LicenseInfo } from './types';
import { Download, Inbox } from 'lucide-react';

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
    defaultConnections: 16,
    autoStart: true,
    soundNotification: true,
    speedLimit: 0,
    categoriesDir: true,
  });
  const [license, setLicense] = useState<LicenseInfo | null>(null);

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
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);

  const prevCompletedCountRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const settingsRef = useRef<Settings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.port === '5173' 
        ? '127.0.0.1:19684' 
        : (window.location.host || '127.0.0.1:19684');
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'INIT') {
            setDownloads(msg.payload.downloads || []);
            if (msg.payload.settings) setSettings(msg.payload.settings);
            if (msg.payload.stats) setStats(msg.payload.stats);
            if (msg.payload.license) setLicense(msg.payload.license);
          } else if (msg.type === 'TELEMETRY') {
            const newDownloads: DownloadItem[] = msg.payload.downloads || [];
            setDownloads(newDownloads);
            if (msg.payload.stats) setStats(msg.payload.stats);
            if (msg.payload.license) setLicense(msg.payload.license);

            // Check if any download just finished
            const completedCount = newDownloads.filter(d => d.status === 'completed').length;
            if (completedCount > prevCompletedCountRef.current && prevCompletedCountRef.current > 0) {
              if (settingsRef.current.soundNotification) playCompletionSound();
              confetti({
                particleCount: 80,
                spread: 70,
                origin: { y: 0.9 },
                colors: ['#10b981', '#3b82f6', '#34d399']
              });
            }
            prevCompletedCountRef.current = completedCount;
          } else if (msg.type === 'LICENSE_UPDATE') {
            if (msg.payload) setLicense(msg.payload);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setTimeout(connectWs, 2000);
      };
    };

    connectWs();

    // Fetch initial settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(() => {});

    // Fetch initial license
    fetch('/api/license')
      .then(res => res.json())
      .then(data => setLicense(data))
      .catch(() => {});

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

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
          connections: options.connections || 32
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

  const handlePause = useCallback(async (id: string) => {
    await fetch(`/api/downloads/${id}/pause`, { method: 'POST' });
  }, []);

  const handleResume = useCallback(async (id: string) => {
    await fetch(`/api/downloads/${id}/resume`, { method: 'POST' });
  }, []);

  const handleRestart = useCallback(async (id: string) => {
    await fetch(`/api/downloads/${id}/restart`, { method: 'POST' });
  }, []);

  const handleDelete = useCallback(async (id: string, deleteFile = false) => {
    await fetch(`/api/downloads/${id}?deleteFile=${deleteFile}`, { method: 'DELETE' });
  }, []);

  const handleOpenFile = useCallback(async (id: string) => {
    await fetch(`/api/downloads/${id}/open`, { method: 'POST' });
  }, []);

  const handleOpenFolder = useCallback(async (id: string) => {
    await fetch(`/api/downloads/${id}/open-folder`, { method: 'POST' });
  }, []);

  const handlePauseAll = useCallback(async () => {
    await fetch('/api/downloads/pause-all', { method: 'POST' });
  }, []);

  const handleResumeAll = useCallback(async () => {
    await fetch('/api/downloads/resume-all', { method: 'POST' });
  }, []);

  const handleClearFinished = useCallback(async () => {
    await fetch('/api/downloads/clear-finished', { method: 'POST' });
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

  const handleActivateLicense = useCallback(async (key: string, name?: string) => {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, customerName: name })
    });
    const data = await res.json();
    if (data.success && data.license) {
      setLicense(data.license);
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899']
      });
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
  const activeConnectionsCount = downloads
    .filter(d => d.status === 'downloading')
    .reduce((acc, d) => {
      const activeSegs = d.segments?.filter(s => s.status === 'downloading' || s.status === 'connecting').length;
      return acc + (activeSegs && activeSegs > 0 ? activeSegs : 1);
    }, 0);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans">
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
          onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
        />

        {/* Center Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#090d16]">
          {/* Top Action Bar */}
          <TopNavbar
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
            onOpenBrowserModal={() => setIsBrowserModalOpen(true)}
            onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
            license={license}
            onPauseAll={handlePauseAll}
            onResumeAll={handleResumeAll}
            onClearFinished={handleClearFinished}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            speedLimit={settings.speedLimit}
            onSpeedLimitChange={handleSpeedLimitChange}
          />

          {/* Downloads List */}
          <main className="flex-1 p-4 overflow-y-auto space-y-2.5">
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
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-600">
                  <Inbox className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-300">No Downloads in this View</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Click &quot;Add URL&quot; above or copy any downloadable link to begin at maximum turbo speed.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all cursor-pointer focus:outline-none select-none"
                >
                  + Add Download Link
                </button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Add Download Modal */}
      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddDownload={handleAddDownload}
        defaultSaveDir={settings.defaultSaveDir}
        defaultConnections={settings.defaultConnections}
      />

      {/* IDM Segment & Speed Inspector Modal */}
      <DownloadDetailsModal
        item={inspectedItem}
        onClose={() => setInspectedItemId(null)}
        onPause={handlePause}
        onResume={handleResume}
        onRestart={handleRestart}
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {/* Browser Integration Modal */}
      <BrowserIntegrationModal
        isOpen={isBrowserModalOpen}
        onClose={() => setIsBrowserModalOpen(false)}
      />

      {/* License & Activation Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
        license={license}
        onActivate={handleActivateLicense}
        onDeactivate={handleDeactivateLicense}
      />
    </div>
  );
};
