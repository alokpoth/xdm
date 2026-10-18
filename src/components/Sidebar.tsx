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
  ArrowDown,
  Crown,
  Sparkles
} from 'lucide-react';
import { DownloadItem, FileCategory, DownloadStatus, GlobalStats, LicenseInfo } from '../types';
import { formatBytes, formatSpeed } from '../utils/formatters';

interface SidebarProps {
  currentFilter: { type: 'status' | 'category'; value: string };
  onSelectFilter: (filter: { type: 'status' | 'category'; value: string }) => void;
  downloads: DownloadItem[];
  stats: GlobalStats;
  license: LicenseInfo | null;
  onOpenLicenseModal: () => void;
}

const SidebarComponent: React.FC<SidebarProps> = ({
  currentFilter,
  onSelectFilter,
  downloads,
  stats,
  license,
  onOpenLicenseModal
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
    { 
      id: 'all', 
      label: 'All Downloads', 
      icon: Layers, 
      count: counts.all, 
      color: 'text-slate-400',
      activeBg: 'bg-slate-800 text-white font-semibold border-slate-700 shadow-sm',
      activeText: 'text-white',
      badgeActive: 'bg-slate-700 text-white font-bold'
    },
    { 
      id: 'downloading', 
      label: 'Downloading', 
      icon: Download, 
      count: counts.downloading, 
      color: 'text-emerald-400', 
      activeGlow: true,
      activeBg: 'bg-emerald-500/15 text-emerald-300 font-semibold border-emerald-500/30 shadow-sm shadow-emerald-950',
      activeText: 'text-emerald-400',
      badgeActive: 'bg-emerald-500 text-black font-bold'
    },
    { 
      id: 'completed', 
      label: 'Finished', 
      icon: CheckCircle2, 
      count: counts.completed, 
      color: 'text-blue-400',
      activeBg: 'bg-blue-500/15 text-blue-300 font-semibold border-blue-500/30 shadow-sm shadow-blue-950',
      activeText: 'text-blue-400',
      badgeActive: 'bg-blue-500 text-white font-bold'
    },
    { 
      id: 'paused', 
      label: 'Paused / Queue', 
      icon: PauseCircle, 
      count: counts.paused, 
      color: 'text-amber-400',
      activeBg: 'bg-amber-500/15 text-amber-300 font-semibold border-amber-500/30 shadow-sm shadow-amber-950',
      activeText: 'text-amber-400',
      badgeActive: 'bg-amber-500 text-black font-bold'
    },
    { 
      id: 'error', 
      label: 'Failed', 
      icon: AlertCircle, 
      count: counts.error, 
      color: 'text-rose-400',
      activeBg: 'bg-rose-500/15 text-rose-300 font-semibold border-rose-500/30 shadow-sm shadow-rose-950',
      activeText: 'text-rose-400',
      badgeActive: 'bg-rose-500 text-white font-bold'
    },
  ];

  const categoryItems = [
    { id: 'compressed', label: 'Compressed', icon: Archive, count: counts.compressed },
    { id: 'video', label: 'Video', icon: Film, count: counts.video },
    { id: 'audio', label: 'Audio', icon: Music, count: counts.audio },
    { id: 'documents', label: 'Documents', icon: FileText, count: counts.documents },
    { id: 'programs', label: 'Programs', icon: Cpu, count: counts.programs },
    { id: 'others', label: 'Others', icon: FolderArchive, count: counts.others },
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
                  type="button"
                  onClick={() => onSelectFilter({ type: 'status', value: item.id })}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.98] cursor-pointer focus:outline-none select-none border ${
                    isSelected
                      ? item.activeBg
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? item.activeText : item.color}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
                      isSelected 
                        ? item.badgeActive 
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
                  type="button"
                  onClick={() => onSelectFilter({ type: 'category', value: item.id })}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.98] cursor-pointer focus:outline-none select-none border ${
                    isSelected
                      ? 'bg-slate-800 text-white font-semibold border-slate-700 shadow-sm'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                      isSelected
                        ? 'bg-slate-700 text-white font-bold'
                        : 'bg-slate-800/80 text-slate-400'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* License Status Card */}
      {license?.isAdmin ? (
        <div 
          onClick={onOpenLicenseModal}
          className="shrink-0 mt-2.5 p-2.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-yellow-950/20 to-slate-900 border border-amber-500/40 shadow-md cursor-pointer hover:border-amber-400/60 transition-all select-none"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
              <span className="text-xs font-bold text-amber-200">Master Admin</span>
            </div>
            <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40">
              64 STREAMS
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center justify-between">
            <span>Owner Access</span>
            <span className="text-amber-400 font-semibold">Active</span>
          </div>
        </div>
      ) : license?.isPro ? (
        <div 
          onClick={onOpenLicenseModal}
          className="shrink-0 mt-2.5 p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-md cursor-pointer hover:border-emerald-500/50 transition-all select-none"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Crown className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-white">PRO Lifetime</span>
            </div>
            <span className="text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">
              32 STREAMS
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center justify-between">
            <span>1-PC Locked</span>
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>
        </div>
      ) : (
        <div 
          onClick={onOpenLicenseModal}
          className="shrink-0 mt-2.5 p-2.5 rounded-xl bg-[#131926] border border-slate-800 hover:border-amber-500/40 shadow-md cursor-pointer transition-all select-none group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300">Free Edition</span>
            </div>
            <span className="text-[9px] font-mono font-semibold bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
              8 STREAMS
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Unlock 32 Streams</span>
            <span className="text-emerald-400 font-bold group-hover:underline">Upgrade &rarr;</span>
          </div>
        </div>
      )}

      {/* Bottom Bandwidth Meter */}
      <div className="shrink-0 mt-2.5 rounded-xl p-3 bg-gradient-to-b from-[#141b2a] to-[#0f1522] border border-slate-800/90 shadow-xl relative overflow-hidden">
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

      {/* Brand & Author Info */}
      <div className="shrink-0 mt-2.5 px-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>XDM Turbo v1.0.7</span>
        <a
          href="https://xdm.zihan.uk"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
              (window as any).electronAPI.openExternal('https://xdm.zihan.uk');
            } else {
              window.open('https://xdm.zihan.uk', '_blank');
            }
          }}
          className="text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer flex items-center space-x-1"
        >
          <span>by Zihan Fakir (xdm.zihan.uk)</span>
        </a>
      </div>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
