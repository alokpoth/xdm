import React, { useState, useEffect } from 'react';
import { X, Settings, Folder, Check, Sliders, Volume2, HardDrive } from 'lucide-react';
import { Settings as SettingsType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsType;
  onSave: (newSettings: Partial<SettingsType>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave
}) => {
  const [form, setForm] = useState<SettingsType>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(settings);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, isOpen, onClose]);

  if (!isOpen) return null;

  const handleBrowseDir = async () => {
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.openDirectoryDialog;
    if (isElectron) {
      const selected = await (window as any).electronAPI.openDirectoryDialog(form.defaultSaveDir);
      if (selected) setForm({ ...form, defaultSaveDir: selected });
    }
  };

  const handleSave = async () => {
    await onSave(form);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#0f1422] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-sm text-white">XDM Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Default Save Dir */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
              Default Download Location
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={form.defaultSaveDir}
                onChange={(e) => setForm({ ...form, defaultSaveDir: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-emerald-500 focus:outline-none text-slate-200 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center space-x-1.5"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* Default Connections */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Default Connections Per File
              </label>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                {form.defaultConnections} Threads
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={form.defaultConnections}
              onChange={(e) => setForm({ ...form, defaultConnections: parseInt(e.target.value, 10) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>1 (Single)</span>
              <span>8</span>
              <span>16 (Optimal)</span>
              <span>32 (Max Turbo)</span>
            </div>
          </div>

          {/* Concurrent Downloads */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Max Concurrent Downloads
              </label>
              <span className="font-mono text-slate-200 font-bold bg-slate-800 px-2 py-0.5 rounded">
                {form.maxConcurrentDownloads} Tasks
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={form.maxConcurrentDownloads}
              onChange={(e) => setForm({ ...form, maxConcurrentDownloads: parseInt(e.target.value, 10) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.categoriesDir}
                onChange={(e) => setForm({ ...form, categoriesDir: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
              />
              <span>Auto-organize files into category folders (Video/, Compressed/, etc.)</span>
            </label>

            <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoStart}
                onChange={(e) => setForm({ ...form, autoStart: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
              />
              <span>Auto-start downloads immediately when added</span>
            </label>

            <label className="flex items-center space-x-2.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.soundNotification}
                onChange={(e) => setForm({ ...form, soundNotification: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
              />
              <span>Play sound alert on download completion</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-900/60 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all flex items-center space-x-1.5"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{saved ? 'Saved!' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
