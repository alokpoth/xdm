import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Zap, Wifi } from 'lucide-react';

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
      className="h-9 min-h-[36px] bg-[#070a10] border-b border-slate-800/80 flex items-center justify-between px-3 select-none titlebar-drag-region z-50 overflow-hidden flex-shrink-0"
    >
      {/* Left: Branding */}
      <div className="flex items-center space-x-2 flex-shrink-0" style={noDragStyle}>
        <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
          <Zap className="w-3 h-3 text-black fill-current stroke-[2.5]" />
        </div>
        <div className="flex items-baseline space-x-1.5 flex-shrink-0">
          <span className="font-bold text-xs tracking-tight text-white font-mono">XDM</span>
          <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/30">
            TURBO
          </span>
        </div>
      </div>

      {/* Center: System Status */}
      <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 flex-shrink-0" style={noDragStyle}>
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Wifi className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] font-medium text-slate-300">
            Engine Connected
          </span>
          {activeConnectionsCount > 0 && (
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/90 px-1 rounded">
              {activeConnectionsCount} threads
            </span>
          )}
        </div>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center space-x-1 flex-shrink-0" style={noDragStyle}>
        {isElectron && (
          <>
            <button
              onClick={handleMinimize}
              className="w-9 h-7 min-w-[36px] flex items-center justify-center rounded hover:bg-slate-800/90 text-slate-400 hover:text-white transition-colors active:bg-slate-700 flex-shrink-0 cursor-pointer focus:outline-none select-none"
              title="Minimize"
              style={noDragStyle}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => handleMaximize(e)}
              className="w-9 h-7 min-w-[36px] flex items-center justify-center rounded hover:bg-slate-800/90 text-slate-400 hover:text-white transition-colors active:bg-slate-700 flex-shrink-0 cursor-pointer focus:outline-none select-none"
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
              className="w-9 h-7 min-w-[36px] flex items-center justify-center rounded hover:bg-rose-600 text-slate-400 hover:text-white transition-colors active:bg-rose-700 flex-shrink-0 cursor-pointer focus:outline-none select-none"
              title="Close to Tray"
              style={noDragStyle}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </header>
  );
});
