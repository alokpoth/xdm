import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Search, 
  Settings, 
  Globe, 
  Gauge, 
  Zap,
  ChevronDown,
  Crown,
  Sparkles
} from 'lucide-react';
import { LicenseInfo } from '../types';

interface TopNavbarProps {
  onOpenAddModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenBrowserModal: () => void;
  onOpenLicenseModal: () => void;
  license: LicenseInfo | null;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearFinished: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  speedLimit: number;
  onSpeedLimitChange: (limit: number) => void;
}

const TopNavbarComponent: React.FC<TopNavbarProps> = ({
  onOpenAddModal,
  onOpenSettingsModal,
  onOpenBrowserModal,
  onOpenLicenseModal,
  license,
  onPauseAll,
  onResumeAll,
  onClearFinished,
  searchQuery,
  onSearchChange,
  speedLimit,
  onSpeedLimitChange
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeedMenu]);

  const speedOptions = [
    { label: 'Turbo (Unlimited)', value: 0 },
    { label: '50 MB/s', value: 50 * 1024 * 1024 },
    { label: '20 MB/s', value: 20 * 1024 * 1024 },
    { label: '10 MB/s', value: 10 * 1024 * 1024 },
    { label: '5 MB/s', value: 5 * 1024 * 1024 },
    { label: '2 MB/s', value: 2 * 1024 * 1024 },
  ];

  return (
    <header className="h-14 min-h-[56px] shrink-0 bg-[#0d121d]/90 border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 backdrop-blur-md z-40 select-none overflow-visible">
      {/* Left: Quick Actions */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAddModal();
          }}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-all shadow-md shadow-emerald-500/20 active:scale-95 shrink-0 cursor-pointer focus:outline-none select-none"
          title="Add New Download Link"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="font-bold whitespace-nowrap">Add URL</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-800 mx-0.5 sm:mx-1 shrink-0" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onResumeAll();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Resume All Downloads"
        >
          <Play className="w-3.5 h-3.5 fill-current text-emerald-400 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Resume All</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPauseAll();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Pause All Downloads"
        >
          <Pause className="w-3.5 h-3.5 fill-current text-amber-400 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Pause All</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClearFinished();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-rose-400 text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Clear Completed Tasks from List"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">Clean</span>
        </button>
      </div>

      {/* Right: Search, Speed Throttle, Browser Extension, Settings */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        {/* Search input */}
        <div className="relative w-32 sm:w-44 md:w-52 transition-all">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 focus:border-emerald-500/50 focus:outline-none text-xs text-slate-200 placeholder-slate-500 transition-all select-text"
          />
        </div>

        {/* Speed Limiter selector */}
        <div className="relative flex-shrink-0" ref={speedMenuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSpeedMenu(!showSpeedMenu);
            }}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-95 cursor-pointer focus:outline-none select-none ${
              speedLimit === 0 
                ? 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700' 
                : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
            }`}
            title="Download Speed Throttle"
          >
            {speedLimit === 0 ? (
              <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/30" />
            ) : (
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline font-mono text-[11px] font-semibold">
              {speedLimit === 0 ? 'Turbo' : `${Math.round(speedLimit / (1024*1024))}M/s`}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showSpeedMenu ? 'rotate-180' : ''}`} />
          </button>

          {showSpeedMenu && (
            <div className="absolute right-0 mt-1 w-48 rounded-xl bg-[#121826] border border-slate-800 shadow-2xl py-1.5 z-50 animate-fadeIn">
              <div className="px-3 py-1 text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold border-b border-slate-800/80 mb-1">
                Bandwidth Throttle
              </div>
              {speedOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpeedLimitChange(opt.value);
                    setShowSpeedMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-800/80 transition-colors cursor-pointer focus:outline-none select-none ${
                    speedLimit === opt.value ? 'text-emerald-400 font-semibold bg-emerald-500/10' : 'text-slate-300'
                  }`}
                >
                  <span>{opt.label}</span>
                  {speedLimit === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Browser Interceptor Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBrowserModal();
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Browser Extension Integration"
        >
          <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="hidden lg:inline text-[11px] whitespace-nowrap">Extension</span>
        </button>

        {/* License PRO Status / Admin / Upgrade Button */}
        {license?.isAdmin ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseModal();
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/25 to-yellow-500/20 hover:from-amber-500/35 hover:to-yellow-500/30 border border-amber-400/60 text-amber-200 text-xs font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer focus:outline-none select-none"
            title="👑 Master Admin Active (Unlimited Devices & 64 Streams)"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
            <span className="font-mono text-[11px] font-bold tracking-wide">ADMIN</span>
          </button>
        ) : license?.isPro ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseModal();
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all shadow-sm shadow-emerald-500/20 active:scale-95 cursor-pointer focus:outline-none select-none"
            title="PRO Lifetime Active (Hardware-Locked to this PC)"
          >
            <Crown className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="font-mono text-[11px] font-bold tracking-wide">PRO</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseModal();
            }}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer focus:outline-none select-none animate-pulse"
            title="Activate XDM Turbo PRO (32 streams & 4K video)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap">Activate PRO</span>
          </button>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettingsModal();
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all shrink-0 active:scale-95 cursor-pointer focus:outline-none select-none"
          title="Settings & Preferences"
        >
          <Settings className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </header>
  );
};

export const TopNavbar = React.memo(TopNavbarComponent);
