import React from 'react';
import { 
  Download, 
  CheckCircle2, 
  PauseCircle, 
  AlertCircle, 
  Layers, 
  Archive, 
  Film, 
  Music, 
  FileText, 
  Cpu, 
  FolderArchive,
  Activity,
  ArrowDown
} from 'lucide-react';
import { DownloadItem, FileCategory, DownloadStatus, GlobalStats } from '../types';
import { formatBytes, formatSpeed } from '../utils/formatters';

interface SidebarProps {
  currentFilter: { type: 'status' | 'category'; value: string };
  onSelectFilter: (filter: { type: 'status' | 'category'; value: string }) => void;
  downloads: DownloadItem[];
  stats: GlobalStats;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFilter,
  onSelectFilter,
  downloads,
  stats
}) => {
  // Compute counts
  const counts = {
    all: downloads.length,
    downloading: downloads.filter(d => d.status === 'downloading' || d.status === 'probing').length,
    completed: downloads.filter(d => d.status === 'completed').length,
    paused: downloads.filter(d => d.status === 'paused' || d.status === 'queued').length,
    error: downloads.filter(d => d.status === 'error').length,
    // Categories
    compressed: downloads.filter(d => d.category === 'compressed').length,
    video: downloads.filter(d => d.category === 'video').length,
    audio: downloads.filter(d => d.category === 'audio').length,
    documents: downloads.filter(d => d.category === 'documents').length,
    programs: downloads.filter(d => d.category === 'programs').length,
    others: downloads.filter(d => d.category === 'others').length,
  };

  const statusItems = [
    { id: 'all', label: 'All Downloads', icon: Layers, count: counts.all, color: 'text-slate-400' },
    { id: 'downloading', label: 'Downloading', icon: Download, count: counts.downloading, color: 'text-emerald-400', activeGlow: true },
    { id: 'completed', label: 'Finished', icon: CheckCircle2, count: counts.completed, color: 'text-blue-400' },
    { id: 'paused', label: 'Paused / Queue', icon: PauseCircle, count: counts.paused, color: 'text-amber-400' },
    { id: 'error', label: 'Failed', icon: AlertCircle, count: counts.error, color: 'text-rose-400' },
  ];

  const categoryItems = [
    { id: 'compressed', label: 'Compressed', icon: Archive, count: counts.compressed, badgeColor: 'bg-indigo-500/10 text-indigo-400' },
    { id: 'video', label: 'Video', icon: Film, count: counts.video, badgeColor: 'bg-rose-500/10 text-rose-400' },
    { id: 'audio', label: 'Audio', icon: Music, count: counts.audio, badgeColor: 'bg-pink-500/10 text-pink-400' },
    { id: 'documents', label: 'Documents', icon: FileText, count: counts.documents, badgeColor: 'bg-amber-500/10 text-amber-400' },
    { id: 'programs', label: 'Programs', icon: Cpu, count: counts.programs, badgeColor: 'bg-emerald-500/10 text-emerald-400' },
    { id: 'others', label: 'Others', icon: FolderArchive, count: counts.others, badgeColor: 'bg-slate-500/10 text-slate-400' },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#0d121d]/90 border-r border-slate-800/80 flex flex-col justify-between select-none h-full p-3 backdrop-blur-xl overflow-hidden">
      <div className="overflow-y-auto flex-1 min-h-0 space-y-5 pr-1">
        {/* Status navigation */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase font-mono">
            Tasks
          </div>
          <div className="space-y-1">
            {statusItems.map((item) => {
              const Icon = item.icon;
              const isSelected = currentFilter.type === 'status' && currentFilter.value === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter({ type: 'status', value: item.id })}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/20 shadow-sm shadow-emerald-950'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-400' : item.color}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
                      isSelected 
                        ? 'bg-emerald-500 text-black font-bold' 
                        : item.activeGlow 
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories navigation */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase font-mono">
            Categories
          </div>
          <div className="space-y-1">
            {categoryItems.map((item) => {
              const Icon = item.icon;
              const isSelected = currentFilter.type === 'category' && currentFilter.value === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter({ type: 'category', value: item.id })}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 shrink-0">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Bandwidth Meter */}
      <div className="shrink-0 mt-3 rounded-xl p-3 bg-gradient-to-b from-[#141b2a] to-[#0f1522] border border-slate-800/90 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
              Live Bandwidth
            </span>
          </div>
          {stats.totalSpeed > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shrink-0">
              <ArrowDown className="w-2.5 h-2.5 mr-0.5" />
              MAX TURBO
            </span>
          )}
        </div>

        <div className="flex items-baseline space-x-1 mb-1">
          <span className="text-2xl font-bold font-mono tracking-tight text-white">
            {formatSpeed(stats.totalSpeed).split('/')[0]}
          </span>
          <span className="text-xs text-slate-400 font-mono">/s</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 mt-2">
          <span>Active: <strong className="text-slate-200">{stats.activeDownloads}</strong></span>
          <span>Downloaded: <strong className="text-slate-200">{formatBytes(stats.totalDownloaded)}</strong></span>
        </div>
      </div>
    </aside>
  );
};
