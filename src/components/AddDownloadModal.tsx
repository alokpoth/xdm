import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Link, 
  Clipboard, 
  Folder, 
  Zap, 
  HardDrive, 
  Check, 
  AlertCircle, 
  Loader2,
  Sliders
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { ProbeResult } from '../types';

interface AddDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDownload: (options: {
    url: string;
    fileName: string;
    connections: number;
    saveDir: string;
    autoStart: boolean;
    category?: string;
  }) => Promise<void>;
  defaultSaveDir: string;
  defaultConnections: number;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  onAddDownload,
  defaultSaveDir,
  defaultConnections
}) => {
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [connections, setConnections] = useState(defaultConnections || 32);
  const [autoStart, setAutoStart] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setSaveDir(defaultSaveDir);
      setConnections(defaultConnections || 32);
      // Auto check clipboard for valid URL
      navigator.clipboard?.readText().then(text => {
        if (text && (text.startsWith('http://') || text.startsWith('https://')) && !url) {
          setUrl(text);
          triggerProbe(text);
        }
      }).catch(() => {});

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    } else {
      setUrl('');
      setFileName('');
      setProbeResult(null);
      setProbeError(null);
    }
  }, [isOpen, defaultSaveDir, defaultConnections, onClose]);

  const triggerProbe = async (targetUrl: string) => {
    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) return;
    setProbing(true);
    setProbeError(null);

    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to probe link');
      
      setProbeResult(data);
      if (!fileName && data.fileName) {
        setFileName(data.fileName);
      }
    } catch (err: any) {
      setProbeError(err.message || 'Cannot probe link headers');
    } finally {
      setProbing(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        triggerProbe(text);
      }
    } catch (e) {}
  };

  const handleBrowseDir = async () => {
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.openDirectoryDialog;
    if (isElectron) {
      const selected = await (window as any).electronAPI.openDirectoryDialog(saveDir);
      if (selected) setSaveDir(selected);
    }
  };

  const handleSubmit = async (startNow: boolean) => {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      await onAddDownload({
        url: url.trim(),
        fileName: fileName.trim(),
        connections,
        saveDir,
        autoStart: startNow,
        category: probeResult?.category
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const connectionPresets = [1, 4, 8, 16, 24, 32];

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#0f1422] border border-slate-800 shadow-2xl overflow-hidden select-none">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-white">Add Download Task</h2>
              <p className="text-[11px] text-slate-400">Multi-threaded Turbo Engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* URL Input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Download Link (URL)
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Link className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  placeholder="https://example.com/file.zip"
                  value={url}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setUrl(nextVal);
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    if (nextVal.length > 8 && (nextVal.startsWith('http://') || nextVal.startsWith('https://'))) {
                      debounceTimerRef.current = setTimeout(() => {
                        triggerProbe(nextVal);
                      }, 400);
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-emerald-500 focus:outline-none text-slate-200 placeholder-slate-500 font-mono text-xs transition-colors"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={handlePaste}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all"
                title="Paste URL from Clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
            </div>
          </div>

          {/* Probe Status Banner */}
          {probing && (
            <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Inspecting server capabilities & file size...</span>
            </div>
          )}

          {probeResult && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-medium text-emerald-300">Target File:</span>
                <span className="font-mono text-white font-semibold truncate max-w-[260px]">
                  {probeResult.fileName}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>File Size:</span>
                <span className="font-mono text-slate-200 font-medium">
                  {probeResult.totalBytes > 0 ? formatBytes(probeResult.totalBytes) : 'Unknown (Stream)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Resume Supported:</span>
                <span className={`font-mono text-xs font-semibold ${probeResult.resumable ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {probeResult.resumable ? '✓ Yes (Turbo Multi-threading Active)' : '⚠ No (Single Stream Only)'}
                </span>
              </div>
            </div>
          )}

          {probeError && !probeResult && (
            <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px]">{probeError}. You can still start downloading directly.</span>
            </div>
          )}

          {/* File Name (Optional rename) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Save As (File Name)
            </label>
            <input
              type="text"
              placeholder="e.g. archive.zip"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-emerald-500 focus:outline-none text-slate-200 placeholder-slate-500 text-xs transition-colors"
            />
          </div>

          {/* Save Directory */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Destination Folder
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={saveDir}
                onChange={(e) => setSaveDir(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-emerald-500 focus:outline-none text-slate-300 font-mono text-[11px] transition-colors"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all"
                title="Browse Folder"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Connections Slider / Preset */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Parallel Network Connections</span>
              </label>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                {connections} Threads
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {connectionPresets.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setConnections(cnt)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
                    connections === cnt
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              *16-32 threads saturate maximum ISP bandwidth by opening parallel TCP range connections.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between">
          <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0 focus:ring-offset-0"
            />
            <span>Start immediately</span>
          </label>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!url.trim() || submitting}
              onClick={() => handleSubmit(false)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50 transition-all"
            >
              Queue
            </button>
            <button
              type="button"
              disabled={!url.trim() || submitting}
              onClick={() => handleSubmit(true)}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 transition-all flex items-center space-x-1.5"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Turbo Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
