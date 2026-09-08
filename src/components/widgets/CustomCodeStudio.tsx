'use client';

import React, { useState } from 'react';
import { CreatorWidget } from '@/types';
import {
  Code2,
  Play,
  Sparkles,
  Save,
  Layers,
  Wand2,
  Terminal,
  CheckCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CustomCodeStudioProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveWidget: (widget: CreatorWidget) => void;
}

const TEMPLATES = [
  {
    id: 'cookie_clicker',
    name: '🍪 Cookie Clicker On-Chain Game',
    description: 'An interactive mini-game where visitors click the cookie to bake points on Cookie Chain.',
    html: `<div class="game-box">
  <h2>🍪 Cookie Baker Mini-Game</h2>
  <p class="sub">Click to bake $COOK!</p>
  <button id="cookieBtn" class="big-cookie">🍪</button>
  <div class="score-board">
    <div>Baked: <span id="score">0</span> COOK</div>
    <div>Speed: <span id="cps">0.0</span> /s</div>
  </div>
  <button id="upgradeBtn" class="upgrade-btn">Buy Auto-Baker (+1/s) [Cost: 10 COOK]</button>
</div>`,
    css: `.game-box { text-align: center; max-width: 320px; margin: 0 auto; }
h2 { font-size: 16px; color: #fbbf24; margin-bottom: 4px; font-weight: bold; }
.sub { font-size: 11px; color: #94a3b8; margin-bottom: 12px; }
.big-cookie { font-size: 54px; background: none; border: none; cursor: pointer; transition: transform 0.1s; user-select: none; }
.big-cookie:active { transform: scale(0.85); }
.score-board { margin: 12px 0; font-family: monospace; font-size: 13px; color: #38bdf8; display: flex; justify-content: space-around; background: #070b14; padding: 8px; border-radius: 12px; border: 1px solid #1e293b; }
.upgrade-btn { background: #ca8a2c; color: #000; border: none; padding: 8px 14px; border-radius: 10px; font-size: 11px; font-weight: bold; cursor: pointer; transition: all 0.2s; width: 100%; }
.upgrade-btn:hover { background: #f59e0b; }`,
    js: `let count = 0;
let autoBake = 0;
let upgradeCost = 10;

const scoreEl = document.getElementById('score');
const cpsEl = document.getElementById('cps');
const btn = document.getElementById('cookieBtn');
const upBtn = document.getElementById('upgradeBtn');

btn.addEventListener('click', () => {
  count += 1;
  scoreEl.textContent = count;
  btn.style.transform = 'scale(1.2)';
  setTimeout(() => btn.style.transform = 'scale(1)', 100);
});

upBtn.addEventListener('click', () => {
  if (count >= upgradeCost) {
    count -= upgradeCost;
    autoBake += 1;
    upgradeCost = Math.round(upgradeCost * 1.5);
    scoreEl.textContent = count;
    cpsEl.textContent = autoBake.toFixed(1);
    upBtn.textContent = 'Buy Auto-Baker (+1/s) [Cost: ' + upgradeCost + ' COOK]';
  } else {
    alert('Need ' + upgradeCost + ' COOK to upgrade!');
  }
});

setInterval(() => {
  if (autoBake > 0) {
    count += autoBake;
    scoreEl.textContent = count;
  }
}, 1000);`,
  },
  {
    id: 'canvas_particles',
    name: '✨ Cyber SVM Generative Visualizer',
    description: 'Interactive HTML5 canvas particle matrix responsive to mouse movements.',
    html: `<div class="vis-container">
  <div class="header">✨ Generative Particle Canvas</div>
  <canvas id="particleCanvas"></canvas>
  <div class="footer">Hover / Click to spawn sub-second energy</div>
</div>`,
    css: `.vis-container { position: relative; width: 100%; max-width: 440px; height: 220px; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
.header { position: absolute; top: 10px; left: 14px; font-size: 11px; font-weight: bold; color: #fbbf24; z-index: 10; pointer-events: none; }
.footer { position: absolute; bottom: 8px; left: 14px; font-size: 10px; color: #64748b; z-index: 10; pointer-events: none; }
#particleCanvas { width: 100%; height: 100%; background: #030712; display: block; }`,
    js: `const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
canvas.width = canvas.parentElement.clientWidth;
canvas.height = 220;

let particles = [];
for (let i = 0; i < 40; i++) {
  particles.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    size: Math.random() * 3 + 1,
    color: Math.random() > 0.5 ? '#f59e0b' : '#38bdf8'
  });
}

function animate() {
  ctx.fillStyle = 'rgba(3, 7, 18, 0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = p.color;
    ctx.fill();
  });

  requestAnimationFrame(animate);
}
animate();

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  for (let i = 0; i < 15; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      size: Math.random() * 4 + 1,
      color: '#10b981'
    });
  }
});`,
  },
  {
    id: 'tip_calculator',
    name: '🧮 Interactive 5% Treasury Split Calculator',
    description: 'Dynamic visual fee calculator showing real-time creator proceeds and platform cuts.',
    html: `<div class="calc-card">
  <h3>⚡ Cookie Chain Fee Splitter</h3>
  <input type="range" id="cookRange" min="1" max="100" value="25" />
  <div class="amt-display"><span id="totalCook">25</span> COOK</div>
  <div class="split-row creator">
    <span>Creator Proceeds (95%):</span>
    <strong id="creatorCut">23.75 COOK</strong>
  </div>
  <div class="split-row treasury">
    <span>Social.wtf Treasury (5%):</span>
    <strong id="treasuryCut">1.25 COOK</strong>
  </div>
</div>`,
    css: `.calc-card { max-width: 320px; width: 100%; background: #070b14; padding: 16px; border-radius: 16px; border: 1px solid #1e293b; text-align: center; }
h3 { font-size: 13px; color: #fbbf24; margin-bottom: 12px; }
input[type=range] { width: 100%; accent-color: #f59e0b; margin-bottom: 10px; cursor: pointer; }
.amt-display { font-size: 20px; font-weight: bold; font-family: monospace; color: #e2e8f0; margin-bottom: 12px; }
.split-row { display: flex; justify-content: space-between; font-size: 11px; padding: 6px 0; border-top: 1px solid #1e293b; }
.creator strong { color: #10b981; font-family: monospace; }
.treasury strong { color: #38bdf8; font-family: monospace; }`,
    js: `const range = document.getElementById('cookRange');
const totalEl = document.getElementById('totalCook');
const creatorEl = document.getElementById('creatorCut');
const treasuryEl = document.getElementById('treasuryCut');

function update() {
  const val = parseFloat(range.value);
  const treasury = val * 0.05;
  const creator = val - treasury;
  totalEl.textContent = val;
  creatorEl.textContent = creator.toFixed(2) + ' COOK';
  treasuryEl.textContent = treasury.toFixed(2) + ' COOK';
}
range.addEventListener('input', update);
update();`,
  },
];

export const CustomCodeStudio: React.FC<CustomCodeStudioProps> = ({
  isOpen,
  onClose,
  onSaveWidget,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0].id);
  const [widgetTitle, setWidgetTitle] = useState(TEMPLATES[0].name);
  const [widgetDesc, setWidgetDesc] = useState(TEMPLATES[0].description);
  const [codeHtml, setCodeHtml] = useState(TEMPLATES[0].html);
  const [codeCss, setCodeCss] = useState(TEMPLATES[0].css);
  const [codeJs, setCodeJs] = useState(TEMPLATES[0].js);

  const [activeCodeTab, setActiveCodeTab] = useState<'html' | 'css' | 'js'>('html');
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  if (!isOpen) return null;

  const handleApplyTemplate = (tempId: string) => {
    const t = TEMPLATES.find((item) => item.id === tempId);
    if (!t) return;
    setSelectedTemplate(tempId);
    setWidgetTitle(t.name);
    setWidgetDesc(t.description);
    setCodeHtml(t.html);
    setCodeCss(t.css);
    setCodeJs(t.js);
    setPreviewReloadKey((k) => k + 1);
  };

  const handleSaveAndDeploy = () => {
    const newWidget: CreatorWidget = {
      id: `custom-code-${Date.now()}`,
      type: 'custom_code',
      title: widgetTitle.trim() || 'Custom Creator Mini-App',
      enabled: true,
      data: {
        html: codeHtml,
        css: codeCss,
        js: codeJs,
        description: widgetDesc,
      },
    };

    onSaveWidget(newWidget);
    try {
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#38bdf8', '#10b981'],
      });
    } catch (e) {}
    onClose();
  };

  // Bundled preview HTML
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
            console.error('Custom code preview error:', e);
          }
        </script>
      </body>
    </html>
  `;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-[#0d1527] border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <span>Creator Code Studio</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Custom Mini-App Builder
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Write, test, and deploy custom interactive code directly to your profile micro-ecosystem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Template Quick Select */}
        <div className="py-3 border-b border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">
            Presets:
          </span>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleApplyTemplate(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedTemplate === t.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Studio Workspace: Left Code Editor / Right Live Sandboxed Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 flex-1 overflow-hidden">
          {/* Left: Code Editor */}
          <div className="flex flex-col h-full bg-[#080d19] border border-slate-800 rounded-2xl overflow-hidden">
            {/* Widget Details Inputs */}
            <div className="p-3 bg-[#0a0f1d] border-b border-slate-800 space-y-2 shrink-0">
              <input
                type="text"
                value={widgetTitle}
                onChange={(e) => setWidgetTitle(e.target.value)}
                placeholder="Widget Title (e.g. My Custom Game)"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-400"
              />
              <input
                type="text"
                value={widgetDesc}
                onChange={(e) => setWidgetDesc(e.target.value)}
                placeholder="Short description for profile visitors..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-[11px] text-slate-400 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Code Language Tabs */}
            <div className="flex bg-slate-950 px-3 pt-2 gap-1 border-b border-slate-800 shrink-0">
              <button
                onClick={() => setActiveCodeTab('html')}
                className={`px-3 py-1.5 rounded-t-lg text-xs font-mono font-bold transition-all ${
                  activeCodeTab === 'html'
                    ? 'bg-[#080d19] text-amber-400 border-t border-x border-slate-800'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                index.html
              </button>
              <button
                onClick={() => setActiveCodeTab('css')}
                className={`px-3 py-1.5 rounded-t-lg text-xs font-mono font-bold transition-all ${
                  activeCodeTab === 'css'
                    ? 'bg-[#080d19] text-amber-400 border-t border-x border-slate-800'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                styles.css
              </button>
              <button
                onClick={() => setActiveCodeTab('js')}
                className={`px-3 py-1.5 rounded-t-lg text-xs font-mono font-bold transition-all ${
                  activeCodeTab === 'js'
                    ? 'bg-[#080d19] text-amber-400 border-t border-x border-slate-800'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                script.js
              </button>
            </div>

            {/* Code Textarea Editor */}
            <div className="flex-1 p-3 overflow-auto">
              {activeCodeTab === 'html' && (
                <textarea
                  value={codeHtml}
                  onChange={(e) => {
                    setCodeHtml(e.target.value);
                    setPreviewReloadKey((k) => k + 1);
                  }}
                  className="w-full h-full bg-transparent font-mono text-xs text-amber-200 resize-none focus:outline-none leading-relaxed"
                />
              )}
              {activeCodeTab === 'css' && (
                <textarea
                  value={codeCss}
                  onChange={(e) => {
                    setCodeCss(e.target.value);
                    setPreviewReloadKey((k) => k + 1);
                  }}
                  className="w-full h-full bg-transparent font-mono text-xs text-blue-300 resize-none focus:outline-none leading-relaxed"
                />
              )}
              {activeCodeTab === 'js' && (
                <textarea
                  value={codeJs}
                  onChange={(e) => {
                    setCodeJs(e.target.value);
                    setPreviewReloadKey((k) => k + 1);
                  }}
                  className="w-full h-full bg-transparent font-mono text-xs text-emerald-300 resize-none focus:outline-none leading-relaxed"
                />
              )}
            </div>
          </div>

          {/* Right: Real-Time Live Sandboxed Runner */}
          <div className="flex flex-col h-full bg-[#080d19] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#0a0f1d] border-b border-slate-800 shrink-0">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Interactive Sandboxed Preview</span>
              </span>
              <button
                onClick={() => setPreviewReloadKey((k) => k + 1)}
                className="text-[11px] text-amber-400 hover:underline"
              >
                Reload Runner
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden bg-[#0d1527]">
              <iframe
                key={previewReloadKey}
                srcDoc={bundledHtml}
                sandbox="allow-scripts"
                title="Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 shrink-0">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Runs client-side in a sandboxed execution container.</span>
          </p>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndDeploy}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Deploy to Profile Mini-App</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
