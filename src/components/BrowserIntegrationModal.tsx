import React, { useState, useEffect } from 'react';
import { X, Globe, Copy, Check, ExternalLink, Code, Zap } from 'lucide-react';

interface BrowserIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrowserIntegrationModal: React.FC<BrowserIntegrationModalProps> = ({
  isOpen,
  onClose
}) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [copiedExtPath, setCopiedExtPath] = useState(false);
  const [autoInstalled, setAutoInstalled] = useState(false);
  const [extensionPath, setExtensionPath] = useState('E:\\XDM\\extension');

  useEffect(() => {
    if (isOpen) {
      fetch('/api/extension/status')
        .then(res => res.json())
        .then(data => {
          if (data.extensionDir) setExtensionPath(data.extensionDir);
        })
        .catch(() => {});

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleAutoInstall = async () => {
    try {
      const res = await fetch('/api/extension/auto-install', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAutoInstalled(true);
        setTimeout(() => setAutoInstalled(false), 3000);
      }
    } catch (e) {}
  };

  const handleLaunchBrowser = async (browser: string) => {
    await fetch('/api/extension/launch-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser })
    });
  };

  if (!isOpen) return null;

  const scriptUrl = 'http://127.0.0.1:19684/extension/xdm-helper.user.js';
  const bookmarkletCode = `javascript:(function(){const u=prompt('Enter or confirm download URL:', window.location.href);if(u){fetch('http://127.0.0.1:19684/api/downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:u,autoStart:true})}).then(()=>alert('Sent to XDM Turbo!')).catch(()=>alert('Could not connect to XDM engine'));}})();`;

  const handleCopyScriptUrl = () => {
    navigator.clipboard.writeText(scriptUrl);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 2000);
  };

  const handleCopyExtPath = () => {
    navigator.clipboard.writeText(extensionPath);
    setCopiedExtPath(true);
    setTimeout(() => setCopiedExtPath(false), 2000);
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-xl rounded-2xl bg-[#0f1422] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-white">Browser Integration</h2>
              <p className="text-[11px] text-slate-400">Automatic Extension Installer & Video Grabber</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none select-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Method 1: Official Native Chrome / Edge / Brave Extension */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-300 font-mono text-[12px] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Automatic Extension Integration</span>
              </span>
              <span className="text-[10px] bg-emerald-500 text-black px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                IDM Auto Mode
              </span>
            </div>
            <p className="text-slate-200 leading-relaxed text-[11px]">
              When XDM is installed or run, it automatically registers with Chrome, Edge, and Brave via Windows Registry!
            </p>
            
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleAutoInstall}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 cursor-pointer focus:outline-none select-none"
              >
                {autoInstalled ? <Check className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                <span>{autoInstalled ? 'Registered in Windows Registry!' : 'Auto-Register in Windows Registry'}</span>
              </button>

              <button
                onClick={() => handleLaunchBrowser('chrome')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all cursor-pointer focus:outline-none select-none"
              >
                Open Chrome
              </button>

              <button
                onClick={() => handleLaunchBrowser('edge')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all cursor-pointer focus:outline-none select-none"
              >
                Open Edge
              </button>

              <button
                onClick={handleCopyExtPath}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all flex items-center space-x-1 cursor-pointer focus:outline-none select-none"
                title="Copy folder path"
              >
                {copiedExtPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedExtPath ? 'Path Copied!' : 'Copy Path'}</span>
              </button>
            </div>
          </div>

          {/* Method 2: Tampermonkey Userscript */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-400 font-mono text-[11px]">
                Option 2: 1-Click Tampermonkey Userscript
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                Alternative
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Install the official XDM Userscript via <strong>Tampermonkey</strong> or <strong>Violentmonkey</strong>. Any download link you click in your browser will automatically open in XDM!
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <a
                href={scriptUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-all flex items-center space-x-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Install Userscript</span>
              </a>
              <button
                onClick={handleCopyScriptUrl}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1 transition-all cursor-pointer focus:outline-none select-none"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Copied Link!' : 'Copy Script URL'}</span>
              </button>
            </div>
          </div>

          {/* Method 2: 1-Click Bookmarklet */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <span className="font-semibold text-blue-400 font-mono text-[11px]">
              Option 2: Browser Bookmarklet
            </span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Drag or copy this bookmarklet to your browser's bookmarks bar. Click it on any page to immediately download files with XDM!
            </p>
            <button
              onClick={handleCopyBookmarklet}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1.5 transition-all cursor-pointer focus:outline-none select-none"
            >
              {copiedBookmarklet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Code className="w-3.5 h-3.5" />}
              <span>{copiedBookmarklet ? 'Bookmarklet Copied!' : 'Copy Bookmarklet Code'}</span>
            </button>
          </div>

          {/* Method 3: REST API */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5 font-mono text-[11px]">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              Developer & CLI Hook
            </span>
            <div className="p-2 rounded bg-black/60 text-slate-300 break-all select-text">
              curl -X POST http://127.0.0.1:19684/api/downloads -H &quot;Content-Type: application/json&quot; -d &apos;&#123;&quot;url&quot;: &quot;https://example.com/file.zip&quot;, &quot;connections&quot;: 16&#125;&apos;
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-900/60 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer focus:outline-none select-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
