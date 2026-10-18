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
  Sliders,
  Film,
  Music,
  Sparkles
} from 'lucide-react';
import { formatBytes, formatXdmFileName } from '../utils/formatters';
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
    formatId?: string;
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
  const [connections, setConnections] = useState(() => {
    try {
      const saved = localStorage.getItem('xdm_connections');
      if (saved) return parseInt(saved, 10);
    } catch (e) {}
    return defaultConnections || 32;
  });
  const [selectedFormat, setSelectedFormat] = useState<string>('best');
  const [autoStart, setAutoStart] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceTimerRef = useRef<any>(null);

  const updateConnections = (val: number) => {
    const clamped = Math.min(Math.max(val, 1), 64);
    setConnections(clamped);
    try {
      localStorage.setItem('xdm_connections', clamped.toString());
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen) {
      setSaveDir(defaultSaveDir);
      try {
        const saved = localStorage.getItem('xdm_connections');
        if (saved) setConnections(parseInt(saved, 10));
        else setConnections(defaultConnections || 32);
      } catch (e) {
        setConnections(defaultConnections || 32);
      }
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
      setSelectedFormat('best');
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
      if (data.fileName) {
        setFileName(formatXdmFileName(data.fileName));
      }
      if (data.isVideo) {
        setSelectedFormat('best');
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

  const handleSelectFormat = (fmtId: string) => {
    setSelectedFormat(fmtId);
    if (!fileName) return;

    const isAudioOnly = !/video|height/i.test(fmtId) && /audio|mp3/i.test(fmtId);
    const targetExt = isAudioOnly ? '.mp3' : '.mp4';
    const clean = fileName.replace(/\.(mp4|mkv|webm|mp3|m4a|wav|flac|avi)$/i, '');
    setFileName(formatXdmFileName(`${clean}${targetExt}`));
  };

  const handleSubmit = async (startNow: boolean) => {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const formattedName = formatXdmFileName(fileName.trim() || 'download');
      const isAudioOnly = !/video|height/i.test(selectedFormat) && /audio|mp3/i.test(selectedFormat);
      await onAddDownload({
        url: url.trim(),
        fileName: formattedName,
        connections,
        saveDir,
        autoStart: startNow,
        category: isAudioOnly ? 'audio' : (probeResult?.category || 'video'),
        formatId: selectedFormat
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isVideoUrl = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com|\.(mp4|mkv|webm|avi|mov)$/i.test(url);
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
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none select-none"
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
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer focus:outline-none select-none"
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

          {/* Video Resolution & Audio Selection (when video detected or video link) */}
          {(probeResult?.isVideo || isVideoUrl) && (
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-3">
              {/* Video Thumbnail & Metadata Preview */}
              {probeResult?.videoInfo && (
                <div className="flex items-center space-x-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  {probeResult.videoInfo.thumbnail && (
                    <img
                      src={probeResult.videoInfo.thumbnail}
                      alt="Thumbnail"
                      className="w-20 h-12 object-cover rounded-lg border border-slate-700/60 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate" title={probeResult.videoInfo.title}>
                      {probeResult.videoInfo.title}
                    </h4>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1">
                      {probeResult.videoInfo.uploader && (
                        <span className="truncate max-w-[130px] text-emerald-400 font-medium">
                          {probeResult.videoInfo.uploader}
                        </span>
                      )}
                      {probeResult.videoInfo.durationString && (
                        <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                          ⏱ {probeResult.videoInfo.durationString}
                        </span>
                      )}
                      {probeResult.videoInfo.formats?.some((f: any) => f.resolution?.includes('2160') || f.label?.includes('4K')) && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold font-mono text-[9px] flex items-center space-x-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>4K 60fps Ready</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-300 font-mono flex items-center space-x-1.5">
                  <Film className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Choose Video Resolution / Audio</span>
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-bold flex items-center space-x-1">
                  {(!/video|height/i.test(selectedFormat) && /audio|mp3/i.test(selectedFormat)) ? (
                    <>
                      <Music className="w-3 h-3 text-purple-400" />
                      <span>MP3 Audio Only</span>
                    </>
                  ) : (
                    <>
                      <Film className="w-3 h-3 text-emerald-400" />
                      <span>MP4 Video</span>
                    </>
                  )}
                </span>
              </div>

              {/* Resolution options with 4K 60fps, 2K 60fps, 1080p, 720p, etc. */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectFormat('best')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat === 'best'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Best (Auto Max)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=2160][fps>=50]+bestaudio/bestvideo[height<=2160]+bestaudio/best')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat.includes('2160')
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-950 font-bold ring-1 ring-amber-500/40'
                      : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:border-amber-500/40'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="font-semibold">4K 60fps Ultra</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=1440][fps>=50]+bestaudio/bestvideo[height<=1440]+bestaudio/best')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat.includes('1440')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Film className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>2K 60fps QHD</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=1080][fps>=50]+bestaudio/bestvideo[height<=1080]+bestaudio/best')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat.includes('1080')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Film className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>1080p 60fps</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=720]+bestaudio/best[height<=720]')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat.includes('720')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Film className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>720p HD</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=480]+bestaudio/best[height<=480]')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat.includes('480')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>480p SD</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=360]+bestaudio/best[height<=360]')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    selectedFormat.includes('360')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>360p</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestaudio/best')}
                  className={`col-span-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none ${
                    (!/video|height/i.test(selectedFormat) && /audio|mp3/i.test(selectedFormat))
                      ? 'bg-purple-500/25 text-purple-300 border-purple-500/50 shadow-sm shadow-purple-950 font-bold ring-1 ring-purple-500/40'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>MP3 Audio Only (320kbps Crystal Clear)</span>
                </button>
              </div>
            </div>
          )}

          {probeResult && !probeResult.isVideo && (
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
              placeholder="e.g. archive XDM by Zihan.zip"
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
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer focus:outline-none select-none"
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

            <div className="grid grid-cols-6 gap-1.5 mb-2">
              {connectionPresets.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => updateConnections(cnt)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer focus:outline-none select-none ${
                    connections === cnt
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>

            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={connections}
              onChange={(e) => updateConnections(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
              <span>1 (Single)</span>
              <span>8</span>
              <span>16</span>
              <span>24</span>
              <span className="text-emerald-400 font-bold">32 (Turbo Max)</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              *Choose any thread count from 1 to 32. 32 threads fully saturates maximum Gigabit ISP bandwidth.
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
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer focus:outline-none select-none"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!url.trim() || submitting}
              onClick={() => handleSubmit(false)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer focus:outline-none select-none"
            >
              Queue
            </button>
            <button
              type="button"
              disabled={!url.trim() || submitting}
              onClick={() => handleSubmit(true)}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 transition-all flex items-center space-x-1.5 cursor-pointer focus:outline-none select-none"
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
