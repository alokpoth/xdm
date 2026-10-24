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
  onOpenFile: (id: string, filePath?: string) => void;
  onOpenFolder: (id: string, filePath?: string) => void;
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
    if (item?.id) {
      setActiveTab('segments');
    }
  }, [item?.id]);

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
        <div className="h-44 flex items-center justify-center text-slate-400 theme-text-secondary text-xs">
          Gathering speed data...
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-3xl rounded-3xl liquid-modal-panel border border-white/[0.09] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] backdrop-blur-2xl">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] flex-shrink-0">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-white theme-text-primary truncate max-w-lg tracking-tight" title={item.fileName}>
                {item.fileName}
              </h2>
              <div className="flex items-center space-x-2 text-[11px] text-slate-400 theme-text-secondary font-mono">
                <span className={`font-bold tabular-nums ${
                  item.status === 'completed' ? 'text-emerald-400' :
                  item.status === 'error' ? 'text-rose-400' :
                  item.status === 'paused' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {item.status === 'completed' ? '100%' : `${(item.progress || 0).toFixed(1)}%`}
                </span>
                <span className="text-slate-600">•</span>
                <span className="tabular-nums">{formatBytes(item.downloadedBytes)} {item.totalBytes > 0 && `of ${formatBytes(item.totalBytes)}`}</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400 font-bold tabular-nums">{formatSpeed(item.speed)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {item.status === 'downloading' ? (
              <button
                onClick={() => onPause(item.id)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer focus:outline-none select-none transition-all active:scale-95 shadow-sm"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            ) : item.status !== 'completed' ? (
              <button
                onClick={() => onResume(item.id)}
                className="btn-emerald-glow px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer focus:outline-none select-none transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={() => onOpenFile(item.id, item.filePath)}
                className="btn-emerald-glow px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer focus:outline-none select-none transition-all active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open File</span>
              </button>
            )}

            <button
              onClick={() => onOpenFolder(item.id, item.filePath)}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-all cursor-pointer focus:outline-none select-none active:scale-95 shadow-sm"
              title="Open Folder"
            >
              <FolderOpen className="w-4 h-4 text-sky-400" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none select-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Segment Progress */}
        <div className="px-6 pt-3.5 pb-2.5 bg-white/[0.01] border-b border-white/[0.06]">
          <SegmentProgressBar
            segments={item.segments}
            totalBytes={item.totalBytes}
            overallProgress={item.progress}
            status={item.status}
            height="h-3"
          />
        </div>

        {item.status === 'error' && (
          <div className="mx-6 my-3 px-4 py-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-sm">
            <span className="truncate mr-2 font-mono"><strong>Error:</strong> {item.error || 'Download failed'}</span>
            <button
              onClick={() => onRestart(item.id)}
              className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-[10px] font-semibold uppercase flex-shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 px-6 border-b border-white/[0.06] bg-black/10 text-xs font-medium">
          <button
            onClick={() => setActiveTab('segments')}
            className={`flex items-center space-x-1.5 px-3.5 py-3 border-b-2 transition-all cursor-pointer focus:outline-none select-none ${
              activeTab === 'segments'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Download Streams ({item.segments?.length || 1})</span>
          </button>

          <button
            onClick={() => setActiveTab('speed')}
            className={`flex items-center space-x-1.5 px-3.5 py-3 border-b-2 transition-all cursor-pointer focus:outline-none select-none ${
              activeTab === 'speed'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Speed Graph</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center space-x-1.5 px-3.5 py-3 border-b-2 transition-all cursor-pointer focus:outline-none select-none ${
              activeTab === 'logs'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Activity History ({item.logs?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center space-x-1.5 px-3.5 py-3 border-b-2 transition-all cursor-pointer focus:outline-none select-none ${
              activeTab === 'info'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>File Details</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 flex-1 overflow-y-auto text-xs">
          {/* TAB 1: IDM SEGMENTS GRID */}
          {activeTab === 'segments' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-slate-400 theme-text-secondary text-[11px] font-mono">
                <span>
                  Active Download Streams: <strong className="text-white theme-text-primary font-bold">{item.segments?.length || 1}</strong>
                </span>
                <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 text-[10px] font-semibold inline-flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>High-Speed Acceleration Active</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {[...(item.segments || [])].sort((a, b) => a.start - b.start).map((seg) => {
                  const isUnknownTotal = !isFinite(seg.end) || seg.end <= seg.start;
                  const segTotal = isUnknownTotal ? 0 : Math.max(1, seg.end - seg.start + 1);
                  const segDownloaded = Math.max(0, seg.current - seg.start);
                  const segPercent = isUnknownTotal 
                    ? (seg.status === 'completed' ? 100 : (item.progress || 0)) 
                    : Math.min(100, (segDownloaded / segTotal) * 100);

                  return (
                    <div
                      key={seg.id}
                      className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/30 transition-all space-y-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-slate-200 theme-text-primary">
                          Stream #{seg.id + 1}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            seg.status === 'completed'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : seg.status === 'downloading'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                              : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'
                          }`}
                        >
                          {seg.status}
                        </span>
                      </div>

                      {/* Mini segment bar */}
                      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/[0.04]">
                        <div
                          className={`h-full transition-all duration-200 ${
                            seg.status === 'completed' ? 'bg-blue-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${segPercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 theme-text-secondary font-mono">
                        <span className="tabular-nums">
                          {isUnknownTotal 
                            ? `${formatBytes(segDownloaded)} (Stream)` 
                            : `${formatBytes(segDownloaded)} / ${formatBytes(segTotal)} (${segPercent.toFixed(0)}%)`}
                        </span>
                        <span className="text-emerald-400 font-bold tabular-nums">
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
            <div className="h-64 rounded-2xl bg-black/30 p-4 font-mono text-[11px] overflow-y-auto space-y-1.5 border border-white/[0.06] shadow-inner">
              {item.logs?.length ? (
                item.logs.map((log, index) => (
                  <div key={index} className="flex space-x-2">
                    <span className="text-slate-500 flex-shrink-0 tabular-nums">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'error'
                          ? 'text-rose-400 font-medium'
                          : log.type === 'warn'
                          ? 'text-amber-400 font-medium'
                          : log.type === 'success'
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-300 theme-text-primary'
                      }
                    >
                      {log.msg}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 theme-text-secondary">No activity recorded yet.</div>
              )}
            </div>
          )}

          {/* TAB 4: FILE INFO */}
          {activeTab === 'info' && (
            <div className="space-y-3 bg-white/[0.03] p-5 rounded-2xl border border-white/[0.06] shadow-sm">
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/[0.04]">
                <span className="text-slate-400 theme-text-secondary font-medium font-mono text-[11px]">Source URL</span>
                <span className="col-span-2 text-slate-200 theme-text-primary font-mono text-[11px] break-all">{item.url}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/[0.04]">
                <span className="text-slate-400 theme-text-secondary font-medium font-mono text-[11px]">Saved Location</span>
                <span className="col-span-2 text-slate-200 theme-text-primary font-mono text-[11px] break-all">{item.filePath || item.saveDir}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/[0.04]">
                <span className="text-slate-400 theme-text-secondary font-medium font-mono text-[11px]">Content Type</span>
                <span className="col-span-2 text-slate-200 theme-text-primary font-mono text-xs">{item.contentType}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/[0.04]">
                <span className="text-slate-400 theme-text-secondary font-medium font-mono text-[11px]">Resume Capability</span>
                <span className={`col-span-2 font-mono font-semibold text-xs ${item.resumable ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {item.resumable ? 'Supported (Fast Resume Ready)' : 'Standard (No Resume Support)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2">
                <span className="text-slate-400 theme-text-secondary font-medium font-mono text-[11px]">Date Created</span>
                <span className="col-span-2 text-slate-200 theme-text-primary font-mono text-xs">{formatDate(item.createdAt)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
