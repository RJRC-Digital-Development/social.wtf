'use client';

import React, { useState, useRef } from 'react';
import { Code2, Play, RefreshCw, Copy, Check, Terminal, ExternalLink, Sparkles } from 'lucide-react';

interface CustomCodeWidgetProps {
  title: string;
  codeHtml: string;
  codeCss?: string;
  codeJs?: string;
  description?: string;
  authorName?: string;
}

export const CustomCodeWidget: React.FC<CustomCodeWidgetProps> = ({
  title,
  codeHtml,
  codeCss = '',
  codeJs = '',
  description,
  authorName,
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Bundle into a self-contained HTML document for the sandboxed iframe
  const bundledHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: #0d1527;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            overflow: hidden;
          }
          ${codeCss}
        </style>
      </head>
      <body>
        ${codeHtml}
        <script>
          try {
            ${codeJs}
          } catch (e) {
            console.error('Custom code error:', e);
          }
        </script>
      </body>
    </html>
  `;

  const fullSourceCode = `<!-- HTML -->\n${codeHtml}\n\n/* CSS */\n${codeCss}\n\n// JavaScript\n${codeJs}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fullSourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-3xl bg-[#0d1527] border border-slate-700/80 overflow-hidden shadow-2xl transition-all">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0f1d] border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <h4 className="text-xs font-bold text-slate-200">{title}</h4>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              CUSTOM CODE MINI-APP
            </span>
          </div>
        </div>

        {/* View Switcher & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[11px]">
            <button
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                viewMode === 'preview'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Interactive App
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                viewMode === 'code'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Source Code
            </button>
          </div>

          {viewMode === 'preview' && (
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              title="Rerun custom code"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          {viewMode === 'code' && (
            <button
              onClick={handleCopyCode}
              title="Copy code"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Description if any */}
      {description && (
        <div className="px-4 py-2 bg-slate-900/40 text-[11px] text-slate-400 border-b border-slate-800/60 flex items-center justify-between">
          <span>{description}</span>
          {authorName && <span className="font-mono text-amber-400">Created by {authorName}</span>}
        </div>
      )}

      {/* Preview Mode: Sandboxed iframe */}
      {viewMode === 'preview' && (
        <div className="relative w-full h-72 bg-[#090e1a] overflow-hidden">
          <iframe
            key={reloadKey}
            srcDoc={bundledHtml}
            sandbox="allow-scripts"
            title={title}
            className="w-full h-full border-0"
          />
        </div>
      )}

      {/* Code Mode: Syntax / Monospace view */}
      {viewMode === 'code' && (
        <div className="relative w-full h-72 bg-[#060913] p-4 overflow-auto font-mono text-xs text-slate-300 leading-relaxed border-t border-slate-800">
          <pre className="whitespace-pre">{fullSourceCode}</pre>
        </div>
      )}

      {/* Footer Info */}
      <div className="px-4 py-2.5 bg-[#0a0f1d] border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Sandboxed Client Execution Environment</span>
        </span>
        <span className="text-amber-400/90">Zero-Server Dependency</span>
      </div>
    </div>
  );
};
