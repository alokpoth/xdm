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
  Sparkles,
  Crown,
  Clock
} from 'lucide-react';
import { formatBytes, formatXdmFileName } from '../utils/formatters';
import { ProbeResult, FileCategory } from '../types';

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
  initialUrl?: string;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  onAddDownload,
  defaultSaveDir,
  defaultConnections,
  initialUrl,
  isPro = false,
  onOpenLicenseModal
}) => {
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [connections, setConnections] = useState(() => {
    if (defaultConnections && defaultConnections > 0) {
      return isPro ? defaultConnections : Math.min(defaultConnections, 4);
    }
    return isPro ? 64 : 4;
  });
  const [selectedFormat, setSelectedFormat] = useState<string>('best');
  const [autoStart, setAutoStart] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceTimerRef = useRef<any>(null);

  const updateConnections = (val: number) => {
    const maxAllowed = isPro ? 64 : 4;
    const clamped = Math.min(Math.max(val, 1), maxAllowed);
    setConnections(clamped);
    try {
      localStorage.setItem('xdm_connections', clamped.toString());
    } catch (e) {}
  };

  const detectCategoryFromExtension = (nameOrUrl: string): FileCategory => {
    const clean = nameOrUrl.split('?')[0].split('#')[0].toLowerCase();
    const ext = clean.substring(clean.lastIndexOf('.') + 1);
    const categories: Record<string, string[]> = {
      compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'xz', 'tgz'],
      video: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'webm', 'm4v', '3gp'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
      documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'epub'],
      programs: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'bat', 'sh']
    };
    for (const [cat, exts] of Object.entries(categories)) {
      if (exts.includes(ext)) return cat as FileCategory;
    }
    return 'others';
  };

  useEffect(() => {
    if (isOpen) {
      setSaveDir(defaultSaveDir);
      const chosen = (defaultConnections && defaultConnections > 0)
        ? (isPro ? defaultConnections : Math.min(defaultConnections, 4))
        : (isPro ? 64 : 4);
      setConnections(chosen);
      if (initialUrl && (initialUrl.startsWith('http://') || initialUrl.startsWith('https://'))) {
        setUrl(initialUrl);
        triggerProbe(initialUrl);
      } else {
        // Auto check clipboard for valid URL
        navigator.clipboard?.readText().then(text => {
          if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
            setUrl(prev => {
              if (!prev) {
                triggerProbe(text);
                return text;
              }
              return prev;
            });
          }
        }).catch(() => {});
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    } else {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setUrl('');
      setFileName('');
      setSelectedFormat('best');
      setProbeResult(null);
      setProbeError(null);
    }
  }, [isOpen, defaultSaveDir, defaultConnections, onClose, initialUrl]);

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

  const isFormatProOnly = (fmtId: string) => {
    return /height<=(2160|1440|1080)|bestaudio/i.test(fmtId);
  };

  const handleSelectFormat = (fmtId: string) => {
    if (!isPro && isFormatProOnly(fmtId)) {
      onOpenLicenseModal?.();
      return;
    }
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
      const fallbackUrlName = url.split('?')[0].split('#')[0].split('/').filter(Boolean).pop();
      const rawName = fileName.trim() || probeResult?.fileName || fallbackUrlName || `download_${Date.now()}`;
      const formattedName = formatXdmFileName(rawName);
      const isAudioOnly = !/video|height/i.test(selectedFormat) && /audio|mp3/i.test(selectedFormat);
      const determinedCat = isAudioOnly 
        ? 'audio' 
        : (probeResult?.category || detectCategoryFromExtension(formattedName) || detectCategoryFromExtension(url) || 'others');

      await onAddDownload({
        url: url.trim(),
        fileName: formattedName,
        connections,
        saveDir,
        autoStart: startNow,
        category: determinedCat,
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
  const connectionPresets = isPro ? [1, 2, 4, 8, 16, 32, 64] : [1, 2, 4];

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-fadeIn"
    >
      <div className="w-full max-w-2xl rounded-3xl liquid-modal-panel border shadow-2xl overflow-hidden select-none backdrop-blur-2xl">
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white theme-text-primary tracking-tight">Add Download</h2>
              <p className="text-[11px] text-slate-400 theme-text-secondary">Turbo Multi-Stream Accelerator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none select-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
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
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#090d19] border border-white/[0.08] focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none text-slate-100 placeholder-slate-500 font-mono text-xs transition-all shadow-inner"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={handlePaste}
                className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer focus:outline-none select-none active:scale-95 shadow-sm"
                title="Paste URL from Clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-medium">Paste</span>
              </button>
            </div>
          </div>

          {/* Probe Status Banner */}
          {probing && (
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-slate-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span className="text-[11px] font-mono">Inspecting remote stream & file headers...</span>
            </div>
          )}

          {/* Video Resolution & Audio Selection (when video detected or video link) */}
          {(probeResult?.isVideo || isVideoUrl) && (
            <div className="p-3.5 rounded-2xl bg-[#090e1c]/80 border border-emerald-500/25 space-y-3">
              {/* Video Thumbnail & Metadata Preview */}
              {probeResult?.videoInfo && (
                <div className="flex items-center space-x-3 p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                  {probeResult.videoInfo.thumbnail && (
                    <img
                      src={probeResult.videoInfo.thumbnail}
                      alt="Thumbnail"
                      className="w-20 h-12 object-cover rounded-lg border border-white/10 shrink-0 shadow-md"
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
                        <span className="bg-white/[0.06] text-slate-300 px-1.5 py-0.5 rounded font-mono text-[9px] border border-white/[0.04] inline-flex items-center">
                          <Clock className="w-2.5 h-2.5 inline mr-1 text-slate-400" />
                          <span>{probeResult.videoInfo.durationString}</span>
                        </span>
                      )}
                      {probeResult.videoInfo.formats?.some((f: any) => f.resolution?.includes('2160') || f.label?.includes('4K')) && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold font-mono text-[9px] flex items-center space-x-1 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
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
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold flex items-center space-x-1">
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
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat === 'best'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.2)] font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>{isPro ? 'Best (Auto Max)' : 'Best (Auto: 720p)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=2160][fps>=50]+bestaudio/bestvideo[height<=2160]+bestaudio/best')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat.includes('2160')
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-[0_0_14px_rgba(245,158,11,0.25)] font-bold'
                      : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:border-amber-500/40 hover:bg-white/[0.06]'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="font-semibold">4K Ultra</span>
                  {!isPro && <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold ml-1">PRO</span>}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=1440][fps>=50]+bestaudio/bestvideo[height<=1440]+bestaudio/best')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat.includes('1440')
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.2)] font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Film className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>2K QHD</span>
                  {!isPro && <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold ml-1">PRO</span>}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=1080][fps>=50]+bestaudio/bestvideo[height<=1080]+bestaudio/best')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat.includes('1080')
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/60 shadow-[0_0_12px_rgba(59,130,246,0.2)] font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Film className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>1080p 60fps</span>
                  {!isPro && <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold ml-1">PRO</span>}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=720]+bestaudio/best[height<=720]')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat.includes('720')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Film className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>720p HD</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=480]+bestaudio/best[height<=480]')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat.includes('480')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span>480p SD</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestvideo[height<=360]+bestaudio/best[height<=360]')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    selectedFormat.includes('360')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span>360p</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFormat('bestaudio/best')}
                  className={`col-span-2 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center justify-center space-x-1 transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    (!/video|height/i.test(selectedFormat) && /audio|mp3/i.test(selectedFormat))
                      ? 'bg-purple-500/25 text-purple-300 border-purple-500/50 shadow-[0_0_14px_rgba(168,85,247,0.25)] font-bold'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>MP3 Audio (320kbps)</span>
                  {!isPro && <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold ml-1">PRO</span>}
                </button>
              </div>
            </div>
          )}

          {probeResult && !probeResult.isVideo && (
            <div className="p-3.5 rounded-2xl bg-[#090e1c]/80 border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-medium text-emerald-400 font-mono text-[11px]">Target File:</span>
                <span className="font-mono text-white font-semibold truncate max-w-[260px] text-xs">
                  {probeResult.fileName}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-mono text-[11px]">File Size:</span>
                <span className="font-mono text-slate-200 font-medium tabular-nums text-xs">
                  {probeResult.totalBytes > 0 ? formatBytes(probeResult.totalBytes) : 'Unknown (Stream)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-mono text-[11px]">Resume Supported:</span>
                <span className={`font-mono text-xs font-semibold ${probeResult.resumable ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {probeResult.resumable ? 'Yes (Turbo Multi-threading Active)' : 'No (Single Stream Only)'}
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
              className="w-full px-3 py-2 rounded-xl bg-[#090d19] border border-white/[0.08] focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none text-slate-100 placeholder-slate-500 text-xs transition-all shadow-inner"
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
                className="w-full px-3 py-2 rounded-xl bg-[#090d19] border border-white/[0.08] focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none text-slate-300 font-mono text-[11px] transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer focus:outline-none select-none active:scale-95 shadow-sm"
                title="Browse Folder"
              >
                <Folder className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-medium">Browse</span>
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
              <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30 tabular-nums">
                {connections} Streams
              </span>
            </div>

            <div className={`grid ${isPro ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-3'} gap-1.5 mb-2`}>
              {connectionPresets.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => updateConnections(cnt)}
                  className={`py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus:outline-none select-none active:scale-95 ${
                    connections === cnt
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.2)] font-bold'
                      : 'bg-white/[0.04] text-slate-400 theme-text-secondary border-white/[0.08] hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {cnt} {cnt === 1 ? 'Stream' : 'Streams'}
                </button>
              ))}
            </div>

            <input
              type="range"
              min="1"
              max={isPro ? 64 : 4}
              step="1"
              value={connections}
              onChange={(e) => updateConnections(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 rounded-lg"
            />
            <div className="flex justify-between text-[11px] text-slate-400 theme-text-secondary mt-1">
              <span>1 (Single)</span>
              {isPro ? (
                <>
                  <span>8</span>
                  <span>16</span>
                  <span>32</span>
                  <span className="text-emerald-400 font-bold">64 (Turbo Max)</span>
                </>
              ) : (
                <>
                  <span>2</span>
                  <span className="text-emerald-400 font-bold">4 (Maximum Free)</span>
                </>
              )}
            </div>
            {!isPro ? (
              <div className="flex items-center justify-between mt-2.5 p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-[11px]">
                <div className="flex items-center space-x-1.5 text-slate-300 theme-text-secondary">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Free edition is capped at 4 streams. Turbo 8–64 streams requires PRO.</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenLicenseModal}
                  className="font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer shrink-0 ml-2"
                >
                  Unlock PRO
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 mt-1">
                *Choose any stream count from 1 to 64. 64 streams fully saturates your high-speed Internet connection.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 liquid-modal-footer bg-black/20 border-t border-white/[0.06] flex items-center justify-between backdrop-blur-xl">
          <label className="flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 focus:ring-offset-0"
            />
            <span>Start immediately</span>
          </label>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer focus:outline-none select-none active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!url.trim() || submitting}
              onClick={() => handleSubmit(false)}
              className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 hover:text-white text-xs font-semibold disabled:opacity-40 transition-all cursor-pointer focus:outline-none select-none active:scale-95"
            >
              Queue
            </button>
            <button
              type="button"
              disabled={!url.trim() || submitting}
              onClick={() => handleSubmit(true)}
              className="btn-emerald-glow px-4.5 py-2 rounded-xl text-xs font-bold disabled:opacity-40 transition-all flex items-center space-x-1.5 cursor-pointer focus:outline-none select-none active:scale-95"
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
