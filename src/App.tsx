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
import { DownloadItem, GlobalStats, Settings, FileCategory } from './types';
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

  const [currentFilter, setCurrentFilter] = useState<{ type: 'status' | 'category'; value: string }>({
    type: 'status',
    value: 'all',
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBrowserModalOpen, setIsBrowserModalOpen] = useState(false);
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);

  const prevCompletedCountRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

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
          } else if (msg.type === 'TELEMETRY') {
            const newDownloads: DownloadItem[] = msg.payload.downloads || [];
            setDownloads(newDownloads);
            if (msg.payload.stats) setStats(msg.payload.stats);

            // Check if any download just finished
            const completedCount = newDownloads.filter(d => d.status === 'completed').length;
            if (completedCount > prevCompletedCountRef.current && prevCompletedCountRef.current > 0) {
              if (settings.soundNotification) playCompletionSound();
              confetti({
                particleCount: 80,
                spread: 70,
                origin: { y: 0.9 },
                colors: ['#10b981', '#3b82f6', '#34d399']
              });
            }
            prevCompletedCountRef.current = completedCount;
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

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [settings.soundNotification]);

  // Actions wrapped in useCallback to prevent re-creation and click latency
  const handleAddDownload = useCallback(async (options: {
    url: string;
    fileName: string;
    connections: number;
    saveDir: string;
    autoStart: boolean;
    category?: string;
  }) => {
    const res = await fetch('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
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

  // Active threads count
  const activeConnectionsCount = downloads
    .filter(d => d.status === 'downloading')
    .reduce((acc, d) => acc + (d.segments?.length || 1), 0);

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
        />

        {/* Center Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#090d16]">
          {/* Top Action Bar */}
          <TopNavbar
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
            onOpenBrowserModal={() => setIsBrowserModalOpen(true)}
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
                  onInspect={(t) => setInspectedItemId(t.id)}
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
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all"
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
    </div>
  );
};
