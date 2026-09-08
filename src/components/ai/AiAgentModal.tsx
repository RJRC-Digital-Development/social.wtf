'use client';

import React, { useState, useRef, useEffect } from 'react';
import { aiAgent, AgentMessage } from '@/lib/ai/agentService';
import { useShield } from '@/lib/shield/shieldContext';
import {
  Bot,
  Send,
  Sparkles,
  Search,
  ShieldCheck,
  Coins,
  Code2,
  ExternalLink,
  ShoppingBag,
  Activity,
  Check,
  Copy,
  X,
  UserCheck,
  Camera,
  Smartphone,
} from 'lucide-react';

interface AiAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVerifyModal: (tab?: 'video_liveness' | 'id_upload') => void;
  onOpenStore: (creatorHandle: string) => void;
  onSelectView: (view: 'feed' | 'store' | 'creator' | 'community' | 'analytics') => void;
}

export const AiAgentModal: React.FC<AiAgentModalProps> = ({
  isOpen,
  onClose,
  onOpenVerifyModal,
  onOpenStore,
  onSelectView,
}) => {
  const { isVideoVerified, isIdVerified } = useShield();

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome-1',
      sender: 'agent',
      timestamp: 'Just now',
      content: `👋 **Welcome! I am the Sentinel AI Agent for Social.wtf.**\n\nI can fulfill tasks, search the Cookie Chain ecosystem, verify your active live video presence (to ensure underage users cannot access mature content through a parent or guardian's device), and inspect on-chain transactions with automated 5% fee splitting.`,
      actions: [
        {
          label: '🛡️ Verify with AI Agent',
          actionType: 'open_verify',
          payload: { tab: 'video_liveness' },
        },
        {
          label: '🔍 Search Digital Goods',
          actionType: 'navigate_tab',
          payload: { view: 'store' },
        },
        {
          label: '⚡ Check Cookie Chain Stats',
          actionType: 'navigate_tab',
          payload: { view: 'analytics' },
        },
      ],
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query) return;

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsThinking(true);

    try {
      // Simulate AI processing & autonomous agent dispatch
      await new Promise((r) => setTimeout(r, 650));
      const agentReply = await aiAgent.processUserPrompt(query, {
        isVideoVerified,
        isIdVerified,
      });
      setMessages((prev) => [...prev, agentReply]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsThinking(false);
    }
  };

  const handleActionClick = (action: { actionType: string; payload?: any }) => {
    if (action.actionType === 'open_verify') {
      onClose();
      onOpenVerifyModal(action.payload?.tab || 'video_liveness');
    } else if (action.actionType === 'open_store') {
      onClose();
      onOpenStore(action.payload?.creatorHandle || 'cryptobaker');
    } else if (action.actionType === 'navigate_tab') {
      onClose();
      onSelectView(action.payload?.view || 'feed');
    } else if (action.actionType === 'copy_code' && action.payload?.code) {
      navigator.clipboard.writeText(action.payload.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full sm:max-w-md h-[85vh] sm:h-[650px] bg-[#0d1527] border border-slate-700/90 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 shadow-md">
                <Bot className="w-5 h-5" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0d1527] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-slate-100 text-sm">Sentinel AI Agent</h3>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  COOKIE CHAIN
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Autonomous Verification &amp; Task Assistant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-medium rounded-tr-sm shadow-md'
                    : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-sm shadow-sm'
                }`}
              >
                <div className="whitespace-pre-line">{msg.content}</div>

                {/* Data Previews */}
                {msg.dataPreview?.type === 'products' && msg.dataPreview.items && (
                  <div className="mt-3 space-y-1.5">
                    {msg.dataPreview.items.map((prod: any) => (
                      <div
                        key={prod.id}
                        onClick={() => handleActionClick({ actionType: 'open_store', payload: { creatorHandle: prod.creatorHandle } })}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={prod.previewUrl}
                            alt={prod.title}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                          <div>
                            <div className="font-bold text-slate-200 text-[11px] line-clamp-1">{prod.title}</div>
                            <div className="text-[10px] text-slate-500">by @{prod.creatorHandle}</div>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-amber-400 text-[11px] shrink-0">
                          {prod.priceCook} COOK
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {msg.dataPreview?.type === 'code' && msg.dataPreview.code && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300">
                    <div className="flex justify-between items-center mb-1 text-slate-500 pb-1 border-b border-slate-800">
                      <span>HTML / Mini-App Snippet</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.dataPreview?.code || '');
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        className="text-amber-400 hover:underline flex items-center gap-1"
                      >
                        {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="overflow-x-auto max-h-32 text-amber-300/90">{msg.dataPreview.code}</pre>
                  </div>
                )}

                <span className="block text-[9px] opacity-60 text-right mt-1">
                  {msg.timestamp}
                </span>
              </div>

              {/* Dynamic Action Buttons */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 max-w-[85%]">
                  {msg.actions.map((act, i) => (
                    <button
                      key={i}
                      onClick={() => handleActionClick(act)}
                      className="px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-amber-200 text-[11px] font-semibold transition-all shadow-sm flex items-center gap-1 active:scale-95"
                    >
                      <span>{act.label}</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex items-center gap-2 text-slate-400 text-xs p-3 rounded-2xl bg-slate-900/60 border border-slate-800 w-max">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
              <span>Sentinel AI is analyzing &amp; executing task...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto bg-slate-900/40 text-[10px] text-slate-400 no-scrollbar">
          <span className="shrink-0 text-slate-500">Suggested:</span>
          {[
            '🛡️ Check my verification status',
            '🔍 Search audio stems & 3D art',
            '💰 Calculate 5% fee split',
            '⚡ Live Cookie Chain stats',
            '💻 Generate mini-app code',
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(prompt)}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 border-t border-slate-800 bg-[#0d1527] flex gap-2"
        >
          <input
            type="text"
            placeholder="Ask AI Agent to search, tip, verify, or build..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim()}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-500/20 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
