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
import { SegmentProgressBar } from './SegmentProgressBar';

interface DownloadRowProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string, deleteFile: boolean) => void;
  onOpenFile: (id: string) => void;
  onOpenFolder: (id: string) => void;
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
  const getCategoryIcon = () => {
    switch (item.category) {
      case 'compressed':
        return <Archive className="w-5 h-5 text-indigo-400" />;
      case 'video':
        return <Film className="w-5 h-5 text-rose-400" />;
      case 'audio':
        return <Music className="w-5 h-5 text-pink-400" />;
      case 'documents':
        return <FileText className="w-5 h-5 text-amber-400" />;
      case 'programs':
        return <Cpu className="w-5 h-5 text-emerald-400" />;
      default:
        return <File className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = () => {
    switch (item.status) {
      case 'downloading':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Downloading</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 flex-shrink-0">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            <span>Finished</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
            <Pause className="w-3 h-3 text-amber-400" />
            <span>Paused</span>
          </span>
        );
      case 'probing':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
            <span>Connecting...</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 flex-shrink-0">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 flex-shrink-0">
            Queued
          </span>
        );
    }
  };

  return (
    <div 
      onClick={() => onInspect(item)}
      className="group rounded-xl p-3 sm:p-3.5 bg-[#121826]/75 hover:bg-[#161e30] border border-slate-800/80 hover:border-slate-700 transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer select-none"
    >
      <div className="flex items-center justify-between gap-2.5">
        {/* Left: Icon & File Meta */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-center flex-shrink-0 group-hover:border-slate-700 transition-colors">
            {getCategoryIcon()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h3 
                className="font-medium text-xs sm:text-sm text-slate-200 group-hover:text-emerald-300 truncate transition-colors" 
                title={item.fileName || item.url}
              >
                {item.fileName || 'Initializing Download...'}
              </h3>
              {getStatusBadge()}
              {item.resumable && (
                <span className="hidden lg:inline-flex text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800/80 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                  Resumable
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 mt-1 text-[11px] text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">
              <span className="font-mono text-slate-300 flex-shrink-0">
                {formatBytes(item.downloadedBytes)} {item.totalBytes > 0 && `/ ${formatBytes(item.totalBytes)}`}
              </span>
              <span className="text-slate-600 flex-shrink-0">•</span>
              <span className="font-mono font-semibold text-emerald-400 flex-shrink-0">
                {item.status === 'completed' ? '100%' : `${(item.progress || 0).toFixed(1)}%`}
              </span>
              {item.status === 'downloading' && (
                <>
                  <span className="text-slate-600 flex-shrink-0">•</span>
                  <span className="font-mono font-bold text-emerald-300 flex items-center flex-shrink-0">
                    <Activity className="w-3 h-3 mr-1 text-emerald-400 animate-pulse" />
                    {formatSpeed(item.speed)}
                  </span>
                  {item.eta > 0 && (
                    <>
                      <span className="text-slate-600 hidden sm:inline flex-shrink-0">•</span>
                      <span className="font-mono text-slate-400 hidden sm:flex items-center flex-shrink-0">
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
                  <span className="text-slate-500 font-mono text-[10px] hidden md:inline flex-shrink-0">
                    {item.segments.length} threads
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="flex items-center space-x-1 sm:space-x-1.5 shrink-0"
        >
          {item.status === 'downloading' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPause(item.id);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
              title="Pause Download"
            >
              <Pause className="w-4 h-4 fill-current shrink-0" />
            </button>
          ) : item.status !== 'completed' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResume(item.id);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
              title="Start / Resume Download"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(item.id);
              }}
              className="h-8 flex items-center space-x-1 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all shadow-sm shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
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
              onOpenFolder(item.id);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="Show in Folder"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspect(item);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="Inspect Connections & Segments"
          >
            <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRestart(item.id);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
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
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all shrink-0 active:scale-90 cursor-pointer focus:outline-none select-none"
            title="Remove from list"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* Unified Master Progress Bar: Butter-smooth, never jumps backwards */}
      <div className="mt-2.5">
        <div className="w-full h-2 bg-slate-900/90 rounded-full overflow-hidden relative border border-slate-800/80">
          <div 
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              item.status === 'completed'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : item.status === 'paused'
                ? 'bg-amber-500'
                : item.status === 'error'
                ? 'bg-rose-500'
                : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
            }`}
            style={{ width: `${item.status === 'completed' ? 100 : Math.min(100, Math.max(0, item.progress || 0))}%` }}
          />
        </div>
      </div>
    </div>
  );
});
