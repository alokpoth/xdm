import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Zap, Wifi, ShieldCheck } from 'lucide-react';

interface TitlebarProps {
  activeConnectionsCount: number;
}

export const Titlebar: React.FC<TitlebarProps> = React.memo(({ activeConnectionsCount }) => {
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (isElectron && (window as any).electronAPI?.isMaximized) {
      (window as any).electronAPI.isMaximized().then((max: boolean) => setIsMaximized(max)).catch(() => {});
    }
    if (isElectron && (window as any).electronAPI?.onMaximizedChange) {
      const cleanup = (window as any).electronAPI.onMaximizedChange((max: boolean) => {
        setIsMaximized(max);
      });
      return cleanup;
    }
  }, [isElectron]);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isElectron) (window as any).electronAPI.minimizeWindow();
  };

  const handleMaximize = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isElectron) (window as any).electronAPI.maximizeWindow();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isElectron) (window as any).electronAPI.closeWindow();
  };

  const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <header 
      onDoubleClick={() => isElectron && handleMaximize()}
      className="h-10 min-h-[40px] bg-[#060911]/95 border-b border-white/[0.06] flex items-center justify-between pl-3.5 pr-0 select-none titlebar-drag-region z-50 overflow-hidden flex-shrink-0 backdrop-blur-xl"
    >
      {/* Left: Branding */}
      <div className="flex items-center space-x-2.5 flex-shrink-0" style={noDragStyle}>
        <div className="w-5.5 h-5.5 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-300 p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.35)] flex-shrink-0">
          <div className="w-full h-full bg-[#080d18] rounded-[6px] flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 stroke-[1.5]" />
          </div>
        </div>
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className="font-extrabold text-[13px] tracking-tight text-white theme-text-primary font-mono">XDM</span>
          <span className="text-[9px] font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/30 uppercase shadow-[0_0_8px_rgba(16,185,129,0.15)]">
            TURBO
          </span>
          <span className="hidden md:inline-flex text-[9px] text-slate-500 theme-text-secondary font-mono font-medium ml-1">
            v1.0.11
          </span>
        </div>
      </div>

      {/* Center: System Status */}
      <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 flex-shrink-0" style={noDragStyle}>
        <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-black/20 border border-white/[0.06] shadow-inner">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <span className="text-[11px] font-medium text-slate-300 theme-text-primary flex items-center space-x-1">
            <span>Engine Ready</span>
          </span>
          {activeConnectionsCount > 0 ? (
            <span className="text-[9px] font-mono font-bold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30 animate-pulse">
              {activeConnectionsCount} streams
            </span>
          ) : (
            <span className="text-[9px] font-mono text-slate-500 bg-white/[0.05] px-1.5 py-0.5 rounded">
              idle
            </span>
          )}
        </div>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center flex-shrink-0 h-full" style={noDragStyle}>
        {isElectron && (
          <div className="flex items-center h-full">
            <button
              onClick={handleMinimize}
              className="w-11 h-10 flex items-center justify-center hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all active:bg-white/[0.12] flex-shrink-0 cursor-pointer focus:outline-none select-none"
              title="Minimize"
              style={noDragStyle}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => handleMaximize(e)}
              className="w-11 h-10 flex items-center justify-center hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all active:bg-white/[0.12] flex-shrink-0 cursor-pointer focus:outline-none select-none"
              title={isMaximized ? "Restore" : "Maximize"}
              style={noDragStyle}
            >
              {isMaximized ? (
                <Copy className="w-3 h-3 rotate-180" />
              ) : (
                <Square className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={handleClose}
              className="w-12 h-10 flex items-center justify-center hover:bg-[#e81123] text-slate-400 hover:text-white transition-all active:bg-[#c40e1d] flex-shrink-0 cursor-pointer focus:outline-none select-none group"
              title="Close to Tray"
              style={noDragStyle}
            >
              <X className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
});
