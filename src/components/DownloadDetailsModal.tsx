import React, { useState, useEffect } from 'react';
import { 
  X, 
  Activity, 
  Cpu, 
  Terminal, 
  Info, 
  Play, 
  Pause, 
  RotateCcw, 
  FolderOpen, 
  ExternalLink,
  Zap,
  Clock,
  HardDrive
} from 'lucide-react';
import { DownloadItem } from '../types';
import { formatBytes, formatSpeed, formatTime, formatDate } from '../utils/formatters';
import { SegmentProgressBar } from './SegmentProgressBar';

interface DownloadDetailsModalProps {
  item: DownloadItem | null;
  onClose: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRestart: (id: string) => void;
  onOpenFile: (id: string) => void;
  onOpenFolder: (id: string) => void;
}

export const DownloadDetailsModal: React.FC<DownloadDetailsModalProps> = ({
  item,
  onClose,
  onPause,
  onResume,
  onRestart,
  onOpenFile,
  onOpenFolder
}) => {
  const [activeTab, setActiveTab] = useState<'segments' | 'speed' | 'logs' | 'info'>('segments');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && item) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  // Render SVG Speed Graph
  const renderSpeedChart = () => {
    const history = item.speedHistory || [];
    if (history.length < 2) {
      return (
        <div className="h-44 flex items-center justify-center text-slate-500 font-mono text-xs">
          Gathering speed telemetry data...
        </div>
      );
    }

    const maxSpeed = Math.max(...history.map(h => h.speed), 1024 * 1024);
    const width = 500;
    const height = 150;
    const padding = 20;

    const points = history.map((pt, i) => {
      const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
      const y = height - padding - (pt.speed / maxSpeed) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    const fillPath = `M ${padding},${height - padding} ${points} L ${width - padding},${height - padding} Z`;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Speed Curve (Last 30s)</span>
          <span className="text-emerald-400 font-bold">Peak: {formatSpeed(item.peakSpeed)}</span>
        </div>
        <div className="w-full bg-slate-900/90 rounded-xl p-3 border border-slate-800">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
            <defs>
              <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#1e293b" strokeDasharray="4 4" />
            <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#1e293b" strokeDasharray="4 4" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" />
            
            {/* Area Fill */}
            <path d={fillPath} fill="url(#speedGrad)" />
            {/* Stroke Line */}
            <polyline fill="none" stroke="#34d399" strokeWidth="2.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[#0e1320] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-white truncate max-w-lg" title={item.fileName}>
                {item.fileName}
              </h2>
              <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                <span className="font-mono text-emerald-400 font-bold">{item.status === 'completed' ? '100%' : `${(item.progress || 0).toFixed(1)}%`}</span>
                <span>•</span>
                <span>{formatBytes(item.downloadedBytes)} {item.totalBytes > 0 && `of ${formatBytes(item.totalBytes)}`}</span>
                <span>•</span>
                <span className="text-slate-300 font-semibold">{formatSpeed(item.speed)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {item.status === 'downloading' ? (
              <button
                onClick={() => onPause(item.id)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center space-x-1"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            ) : item.status !== 'completed' ? (
              <button
                onClick={() => onResume(item.id)}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={() => onOpenFile(item.id)}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center space-x-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open File</span>
              </button>
            )}

            <button
              onClick={() => onOpenFolder(item.id)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Open Folder"
            >
              <FolderOpen className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Segment Progress */}
        <div className="px-5 pt-3 pb-2 bg-slate-900/30 border-b border-slate-800/40">
          <SegmentProgressBar
            segments={item.segments}
            totalBytes={item.totalBytes}
            overallProgress={item.progress}
            status={item.status}
            height="h-3"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 px-5 border-b border-slate-800 bg-slate-900/40 text-xs font-medium">
          <button
            onClick={() => setActiveTab('segments')}
            className={`flex items-center space-x-1.5 px-3 py-2.5 border-b-2 transition-all ${
              activeTab === 'segments'
                ? 'border-emerald-400 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Connection Segments ({item.segments?.length || 1})</span>
          </button>

          <button
            onClick={() => setActiveTab('speed')}
            className={`flex items-center space-x-1.5 px-3 py-2.5 border-b-2 transition-all ${
              activeTab === 'speed'
                ? 'border-emerald-400 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Real-time Speed Graph</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center space-x-1.5 px-3 py-2.5 border-b-2 transition-all ${
              activeTab === 'logs'
                ? 'border-emerald-400 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Transfer Logs ({item.logs?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center space-x-1.5 px-3 py-2.5 border-b-2 transition-all ${
              activeTab === 'info'
                ? 'border-emerald-400 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>File Details</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 flex-1 overflow-y-auto text-xs">
          {/* TAB 1: IDM SEGMENTS GRID */}
          {activeTab === 'segments' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>
                  Parallel TCP Connections: <strong className="text-white">{item.segments?.length || 1}</strong>
                </span>
                <span className="text-emerald-400 font-mono">
                  Adaptive Work-Stealing Active
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {[...(item.segments || [])].sort((a, b) => a.start - b.start).map((seg) => {
                  const segTotal = Math.max(1, seg.end - seg.start + 1);
                  const segDownloaded = Math.max(0, seg.current - seg.start);
                  const segPercent = Math.min(100, (segDownloaded / segTotal) * 100);

                  return (
                    <div
                      key={seg.id}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/90 space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold text-slate-200">
                          Thread #{seg.id + 1}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                            seg.status === 'completed'
                              ? 'bg-blue-500/20 text-blue-400'
                              : seg.status === 'downloading'
                              ? 'bg-emerald-500/20 text-emerald-300 animate-pulse'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {seg.status}
                        </span>
                      </div>

                      {/* Mini segment bar */}
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            seg.status === 'completed' ? 'bg-blue-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${segPercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>
                          {formatBytes(segDownloaded)} / {formatBytes(segTotal)} ({segPercent.toFixed(0)}%)
                        </span>
                        <span className="text-emerald-400 font-bold">
                          {formatSpeed(seg.speed)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: SPEED GRAPH */}
          {activeTab === 'speed' && renderSpeedChart()}

          {/* TAB 3: LOGS */}
          {activeTab === 'logs' && (
            <div className="h-64 rounded-xl bg-black/60 p-3 font-mono text-[11px] overflow-y-auto space-y-1 border border-slate-900">
              {item.logs?.length ? (
                item.logs.map((log, index) => (
                  <div key={index} className="flex space-x-2">
                    <span className="text-slate-500 flex-shrink-0">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'error'
                          ? 'text-rose-400'
                          : log.type === 'warn'
                          ? 'text-amber-400'
                          : log.type === 'success'
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-300'
                      }
                    >
                      {log.msg}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-600">No logs recorded yet.</div>
              )}
            </div>
          )}

          {/* TAB 4: FILE INFO */}
          {activeTab === 'info' && (
            <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 font-medium">Source URL</span>
                <span className="col-span-2 text-slate-200 font-mono text-[11px] break-all">{item.url}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 font-medium">Saved Location</span>
                <span className="col-span-2 text-slate-200 font-mono text-[11px] break-all">{item.filePath || item.saveDir}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 font-medium">Content Type</span>
                <span className="col-span-2 text-slate-200 font-mono">{item.contentType}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 font-medium">Resume Capability</span>
                <span className={`col-span-2 font-mono font-semibold ${item.resumable ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {item.resumable ? 'Supported (HTTP 206 Partial Content)' : 'Not Supported by Server'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5">
                <span className="text-slate-400 font-medium">Date Created</span>
                <span className="col-span-2 text-slate-200 font-mono">{formatDate(item.createdAt)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
