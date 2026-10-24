import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2, 
  FolderOpen, 
  ExternalLink, 
  Activity, 
  Archive, 
  Film, 
  Music, 
  FileText, 
  Cpu, 
  File, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Layers
} from 'lucide-react';
import { DownloadItem } from '../types';
import { formatBytes, formatSpeed, formatTime } from '../utils/formatters';

interface DownloadRowProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
  onOpenFile: (id: string, filePath?: string) => void;
  onOpenFolder: (id: string, filePath?: string) => void;
  onInspect: (item: DownloadItem) => void;
}

export const DownloadRow: React.FC<DownloadRowProps> = React.memo(({
  item,
  onPause,
  onResume,
  onRestart,
  onDelete,
  onOpenFile,
  onOpenFolder,
  onInspect
}) => {
  const getCategoryConfig = () => {
    switch (item.category) {
      case 'compressed':
        return {
          icon: Archive,
          bg: 'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
        };
      case 'video':
        return {
          icon: Film,
          bg: 'bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-transparent border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
        };
      case 'audio':
        return {
          icon: Music,
          bg: 'bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-transparent border-violet-500/30 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
        };
      case 'documents':
        return {
          icon: FileText,
          bg: 'bg-gradient-to-br from-sky-500/20 via-blue-500/10 to-transparent border-sky-500/30 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.15)]'
        };
      case 'programs':
        return {
          icon: Cpu,
          bg: 'bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
        };
      default:
        return {
          icon: File,
          bg: 'bg-gradient-to-br from-slate-500/20 via-slate-500/10 to-transparent border-slate-500/30 text-slate-400'
        };
    }
  };

  const getStatusBadge = () => {
    switch (item.status) {
      case 'downloading':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
            </span>
            <span>Downloading</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 flex-shrink-0">
            <CheckCircle2 className="w-3 h-3 text-teal-400" />
            <span>Finished</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
            <Pause className="w-3 h-3 text-amber-400" />
            <span>Paused</span>
          </span>
        );
      case 'probing':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
            <span>Connecting</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex-shrink-0">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-slate-400 border border-white/[0.05] flex-shrink-0">
            Queued
          </span>
        );
    }
  };

  const cat = getCategoryConfig();
  const IconComponent = cat.icon;

  return (
    <div 
      onClick={() => onInspect(item)}
      className="group rounded-2xl p-3.5 sm:p-4 liquid-glass-card border border-white/[0.06] hover:border-emerald-500/30 transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer select-none backdrop-blur-xl relative overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Icon & File Meta */}
        <div className="flex items-center space-x-3.5 min-w-0 flex-1">
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-transform duration-150 group-hover:scale-102 ${cat.bg}`}>
            <IconComponent className="w-5 h-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h3 
                className="font-semibold text-xs sm:text-sm text-slate-100 theme-text-primary group-hover:text-emerald-400 truncate transition-colors tracking-tight" 
                title={item.fileName || item.url}
              >
                {item.fileName || 'Initializing Download...'}
              </h3>
              {getStatusBadge()}
              {item.resumable && (
                <span className="hidden lg:inline-flex text-[9px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                  Resumable
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2.5 mt-1.5 text-[11px] text-slate-400 theme-text-secondary overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums">
              <span className="text-slate-300 theme-text-primary flex-shrink-0 font-medium">
                {formatBytes(item.downloadedBytes)} {item.totalBytes > 0 && `/ ${formatBytes(item.totalBytes)}`}
              </span>
              <span className="text-slate-600 flex-shrink-0">•</span>
              <span className={`font-bold flex-shrink-0 ${
                item.status === 'completed'
                  ? 'text-teal-400'
                  : item.status === 'error'
                  ? 'text-rose-400'
                  : item.status === 'paused'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}>
                {item.status === 'completed' ? '100%' : `${(item.progress || 0).toFixed(1)}%`}
              </span>

              {item.status === 'error' && (
                <>
                  <span className="text-slate-600 flex-shrink-0">•</span>
                  <span 
                    className="text-rose-400 font-medium text-[11px] truncate max-w-[160px] sm:max-w-xs flex-shrink-0" 
                    title={item.error || 'Download failed'}
                  >
                    {item.error || 'Download failed'}
                  </span>
                </>
              )}

              {item.status === 'downloading' && (
                <>
                  <span className="text-slate-600 flex-shrink-0">•</span>
                  <span className="font-bold text-emerald-400 flex items-center flex-shrink-0">
                    <Activity className="w-3.5 h-3.5 mr-1 text-emerald-400 animate-pulse" />
                    {formatSpeed(item.speed)}
                  </span>
                  {item.eta > 0 && (
                    <>
                      <span className="text-slate-600 hidden sm:inline flex-shrink-0">•</span>
                      <span className="text-slate-400 theme-text-secondary hidden sm:flex items-center flex-shrink-0">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTime(item.eta)} left
                      </span>
                    </>
                  )}
                </>
              )}

              {item.segments && item.segments.length > 1 && (
                <>
                  <span className="text-slate-600 hidden md:inline flex-shrink-0">•</span>
                  <span className="text-slate-400 theme-text-secondary text-[10px] hidden md:inline flex-shrink-0">
                    {item.segments.length} streams
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="flex items-center space-x-1.5 shrink-0"
        >
          {item.status === 'downloading' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPause(item.id);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
              title="Pause Download"
            >
              <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
            </button>
          ) : item.status !== 'completed' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResume(item.id);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
              title="Start / Resume Download"
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(item.id, item.filePath);
              }}
              className="h-8 flex items-center space-x-1 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
              title="Open Finished File"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Open</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFolder(item.id, item.filePath);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-white transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="Show in Folder"
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspect(item);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-emerald-400 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="View Stream Details"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRestart(item.id);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-400 hover:text-amber-400 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="Restart Download"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id, false);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.06] text-slate-400 hover:text-rose-400 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="Remove from list"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* Unified Master Progress Bar */}
      <div className="mt-2.5">
        <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden relative border border-white/[0.06]">
          <div 
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              item.status === 'completed'
                ? 'bg-emerald-400'
                : item.status === 'paused'
                ? 'bg-amber-400'
                : item.status === 'error'
                ? 'bg-rose-400'
                : 'bg-emerald-400'
            }`}
            style={{ width: `${item.status === 'completed' ? 100 : Math.min(100, Math.max(0, item.progress || 0))}%` }}
          />
        </div>
      </div>
    </div>
  );
});
