'use client';

import React, { useState } from 'react';
import { WikiArticle, DiscussionTopic, DiscussionCategory, DiscussionReply } from '@/types';
import { INITIAL_WIKI_ARTICLES, INITIAL_DISCUSSIONS } from '@/lib/data/communityData';
import {
  BookOpen,
  MessageSquare,
  Sparkles,
  Lightbulb,
  TrendingUp,
  Newspaper,
  Wrench,
  Search,
  ThumbsUp,
  PlusCircle,
  Pin,
  Clock,
  User,
  ArrowRight,
  Send,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Tag,
  Share2,
} from 'lucide-react';

interface CommunityHubProps {
  onOpenStore?: (handle: string) => void;
  onOpenVerifyModal?: (tab?: 'video_liveness' | 'id_upload') => void;
}

export const CommunityHub: React.FC<CommunityHubProps> = ({
  onOpenStore,
  onOpenVerifyModal,
}) => {
  const [activeMainTab, setActiveMainTab] = useState<'discussions' | 'wiki'>('discussions');

  // Discussions State
  const [discussions, setDiscussions] = useState<DiscussionTopic[]>(INITIAL_DISCUSSIONS);
  const [discussionFilter, setDiscussionFilter] = useState<'all' | DiscussionCategory>('all');
  const [discussionSearch, setDiscussionSearch] = useState('');
  const [upvotedTopicIds, setUpvotedTopicIds] = useState<Set<string>>(new Set());
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>('disc-1');
  const [newReplyText, setNewReplyText] = useState<{ [key: string]: string }>({});

  // New Topic Modal State
  const [newTopicModalOpen, setNewTopicModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<DiscussionCategory>('wishlist');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  // Wiki State
  const [wikiArticles] = useState<WikiArticle[]>(INITIAL_WIKI_ARTICLES);
  const [wikiFilter, setWikiFilter] = useState<string>('all');
  const [wikiSearch, setWikiSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(INITIAL_WIKI_ARTICLES[0]);
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState(false);

  // Upvote handler
  const handleUpvote = (topicId: string) => {
    setDiscussions((prev) =>
      prev.map((t) => {
        if (t.id === topicId) {
          const alreadyUpvoted = upvotedTopicIds.has(topicId);
          return {
            ...t,
            upvotes: alreadyUpvoted ? t.upvotes - 1 : t.upvotes + 1,
          };
        }
        return t;
      })
    );

    setUpvotedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  // Submit new discussion / wishlist
  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const parsedTags = newTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const created: DiscussionTopic = {
      id: `disc-${Date.now()}`,
      title: newCategory === 'wishlist' ? `💡 ${newTitle}` : newTitle,
      category: newCategory,
      author: {
        name: 'You (Cookie Chain Creator)',
        handle: 'you',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        verified: true,
      },
      content: newContent.trim(),
      createdAt: 'Just now',
      upvotes: 1,
      tags: parsedTags.length > 0 ? parsedTags : ['Community', 'Proposal'],
      repliesCount: 0,
      replies: [],
    };

    setDiscussions([created, ...discussions]);
    setUpvotedTopicIds((prev) => new Set(prev).add(created.id));
    setExpandedTopicId(created.id);

    // Reset Form
    setNewTitle('');
    setNewContent('');
    setNewTags('');
    setNewTopicModalOpen(false);
  };

  // Add reply to discussion
  const handleAddReply = (topicId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newReplyText[topicId]?.trim();
    if (!text) return;

    const newReply: DiscussionReply = {
      id: `rep-${Date.now()}`,
      author: {
        name: 'You',
        handle: 'you',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        badge: 'Cookie Chain Member',
      },
      content: text,
      createdAt: 'Just now',
      likes: 0,
    };

    setDiscussions((prev) =>
      prev.map((t) => {
        if (t.id === topicId) {
          const updatedReplies = [...(t.replies || []), newReply];
          return {
            ...t,
            repliesCount: updatedReplies.length,
            replies: updatedReplies,
          };
        }
        return t;
      })
    );

    setNewReplyText((prev) => ({ ...prev, [topicId]: '' }));
  };

  // Filtered discussions
  const filteredDiscussions = discussions.filter((t) => {
    const matchesCat = discussionFilter === 'all' || t.category === discussionFilter;
    const matchesSearch =
      !discussionSearch.trim() ||
      t.title.toLowerCase().includes(discussionSearch.toLowerCase()) ||
      t.content.toLowerCase().includes(discussionSearch.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(discussionSearch.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  // Filtered wiki articles
  const filteredWiki = wikiArticles.filter((art) => {
    const matchesCat = wikiFilter === 'all' || art.category === wikiFilter;
    const matchesSearch =
      !wikiSearch.trim() ||
      art.title.toLowerCase().includes(wikiSearch.toLowerCase()) ||
      art.summary.toLowerCase().includes(wikiSearch.toLowerCase()) ||
      art.tags.some((tag) => tag.toLowerCase().includes(wikiSearch.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const getCategoryBadge = (cat: DiscussionCategory) => {
    switch (cat) {
      case 'wishlist':
        return { label: '💡 Feature Wishlist', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
      case 'update':
        return { label: '🚀 Platform Update', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
      case 'news':
        return { label: '📰 Ecosystem News', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
      case 'dev_support':
        return { label: '🛠️ Creator & Dev Support', color: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
      default:
        return { label: '💬 General', color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Community Hero Banner */}
      <div className="p-5 md:p-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-[#0d1527] to-blue-500/15 border border-slate-700/80 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Community Wiki &amp; Discussion Board</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                GOVERNANCE &amp; IDEAS
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 max-w-xl leading-relaxed">
              Explore the developer wiki, propose inspired additions, post feature wishlists, review official updates, and discuss up &amp; coming Cookie Chain news.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setNewTopicModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Propose Feature / Wishlist</span>
          </button>
        </div>
      </div>

      {/* Main Mode Navigation (Wiki vs Discussions) */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveMainTab('discussions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold transition-all ${
              activeMainTab === 'discussions'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Discussion Board &amp; Wishlists ({discussions.length})</span>
          </button>

          <button
            onClick={() => setActiveMainTab('wiki')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold transition-all ${
              activeMainTab === 'wiki'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Ecosystem Wiki &amp; Docs ({wikiArticles.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DISCUSSION BOARD & WISHLISTS */}
      {activeMainTab === 'discussions' && (
        <div className="space-y-5 animate-fade-in">
          {/* Sub Filter Chips & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {[
                { id: 'all', label: '🌟 All Topics' },
                { id: 'wishlist', label: '💡 Wishlists' },
                { id: 'update', label: '🚀 Updates' },
                { id: 'news', label: '📰 News' },
                { id: 'dev_support', label: '🛠️ Dev Support' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDiscussionFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    discussionFilter === tab.id
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold shadow-sm'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search ideas, wishlists, updates..."
                value={discussionSearch}
                onChange={(e) => setDiscussionSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Topics Feed */}
          <div className="space-y-4">
            {filteredDiscussions.map((topic) => {
              const badge = getCategoryBadge(topic.category);
              const isUpvoted = upvotedTopicIds.has(topic.id);
              const isExpanded = expandedTopicId === topic.id;

              return (
                <div
                  key={topic.id}
                  className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 hover:border-slate-600/80 transition-all shadow-xl space-y-4"
                >
                  {/* Top Meta: Badges & Author */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {topic.isPinned && (
                        <span className="px-2 py-0.5 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] font-bold text-red-300 flex items-center gap-1">
                          <Pin className="w-3 h-3 text-red-400" />
                          <span>PINNED</span>
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-bold ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-slate-500">•</span>
                      <span className="text-[11px] text-slate-400">{topic.createdAt}</span>
                    </div>

                    {/* Upvote Button */}
                    <button
                      onClick={() => handleUpvote(topic.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isUpvoted
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
                      }`}
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${isUpvoted ? 'fill-slate-950' : ''}`} />
                      <span>{topic.upvotes}</span>
                    </button>
                  </div>

                  {/* Topic Title */}
                  <h3
                    onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                    className="text-base font-bold text-slate-100 hover:text-amber-300 cursor-pointer transition-colors leading-snug"
                  >
                    {topic.title}
                  </h3>

                  {/* Author Header */}
                  <div className="flex items-center gap-2.5">
                    <img
                      src={topic.author.avatar}
                      alt={topic.author.name}
                      className="w-6 h-6 rounded-lg object-cover border border-slate-700"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-300 mr-1">{topic.author.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">@{topic.author.handle}</span>
                    </div>
                  </div>

                  {/* Topic Content Body */}
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    {topic.content}
                  </p>

                  {/* Tags */}
                  {topic.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {topic.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 text-[10px] text-amber-400/90 border border-slate-800 font-mono"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expand / Collapse Replies Section */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                      className="flex items-center gap-1.5 text-xs text-amber-400 hover:underline font-semibold"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>
                        {topic.repliesCount} {topic.repliesCount === 1 ? 'Community Reply' : 'Community Replies'}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    <button
                      onClick={() => setExpandedTopicId(topic.id)}
                      className="text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      Reply to Thread
                    </button>
                  </div>

                  {/* Thread Replies Accordion */}
                  {isExpanded && (
                    <div className="space-y-3 pt-2 animate-fade-in">
                      {/* Replies List */}
                      {topic.replies && topic.replies.length > 0 && (
                        <div className="space-y-2.5 pl-3 border-l-2 border-slate-800">
                          {topic.replies.map((rep) => (
                            <div key={rep.id} className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={rep.author.avatar}
                                    alt={rep.author.name}
                                    className="w-5 h-5 rounded-full object-cover"
                                  />
                                  <span className="font-bold text-xs text-slate-200">{rep.author.name}</span>
                                  {rep.author.badge && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                      {rep.author.badge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500">{rep.createdAt}</span>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed pl-7">{rep.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Reply Input */}
                      <form
                        onSubmit={(e) => handleAddReply(topic.id, e)}
                        className="flex items-center gap-2 pt-1"
                      >
                        <input
                          type="text"
                          placeholder="Join the discussion or share feedback..."
                          value={newReplyText[topic.id] || ''}
                          onChange={(e) =>
                            setNewReplyText({ ...newReplyText, [topic.id]: e.target.value })
                          }
                          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="submit"
                          disabled={!(newReplyText[topic.id] || '').trim()}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredDiscussions.length === 0 && (
              <div className="p-10 rounded-3xl bg-[#0d1527] border border-slate-800 text-center space-y-2">
                <Lightbulb className="w-8 h-8 text-amber-400 mx-auto opacity-60" />
                <h4 className="text-sm font-bold text-slate-200">No discussions match your filter</h4>
                <p className="text-xs text-slate-400">Be the first to propose an idea or submit a wishlist item!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ECOSYSTEM WIKI & GUIDES */}
      {activeMainTab === 'wiki' && (
        <div className="space-y-5 animate-fade-in">
          {/* Wiki Sub Filter & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {[
                { id: 'all', label: '📖 All Guides' },
                { id: 'creator_sdk', label: '🎨 Creator SDK & Pages' },
                { id: 'tokenomics', label: '💰 5% Protocol Fee' },
                { id: 'privacy_ai', label: '🛡️ Sentinel AI & Privacy' },
                { id: 'developers', label: '⚡ SVM Tools & RPC' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setWikiFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    wikiFilter === tab.id
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold shadow-sm'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search wiki articles..."
                value={wikiSearch}
                onChange={(e) => setWikiSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* 2-Column Wiki Layout: Article Selector List / Reader Pane */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Article Selector Column */}
            <div className="lg:col-span-4 space-y-2.5">
              {filteredWiki.map((article) => (
                <div
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                    selectedArticle?.id === article.id
                      ? 'bg-amber-500/15 border-amber-500/40 text-slate-100 shadow-md'
                      : 'bg-[#0d1527] border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-mono text-amber-400 uppercase">{article.category.replace('_', ' ')}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {article.readTime}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs leading-snug mb-1">{article.title}</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{article.summary}</p>
                </div>
              ))}
            </div>

            {/* Right: Selected Article Reader Pane */}
            <div className="lg:col-span-8">
              {selectedArticle ? (
                <div className="p-6 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-mono text-[10px] border border-amber-500/30">
                        {selectedArticle.category.toUpperCase()}
                      </span>
                      <span>•</span>
                      <span>By {selectedArticle.author}</span>
                      <span>•</span>
                      <span>{selectedArticle.lastUpdated}</span>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setCopiedCodeSnippet(true);
                        setTimeout(() => setCopiedCodeSnippet(false), 2000);
                      }}
                      className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                    >
                      {copiedCodeSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                      <span>{copiedCodeSnippet ? 'Link Copied' : 'Share Article'}</span>
                    </button>
                  </div>

                  <h1 className="text-xl font-bold text-slate-100 leading-tight">
                    {selectedArticle.title}
                  </h1>

                  <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-amber-200/90 leading-relaxed">
                    <strong>Summary:</strong> {selectedArticle.summary}
                  </div>

                  <div className="text-xs text-slate-300 leading-relaxed space-y-3 pt-2 whitespace-pre-line font-sans">
                    {selectedArticle.content}
                  </div>

                  {/* Tags */}
                  <div className="pt-4 border-t border-slate-800 flex flex-wrap gap-1.5">
                    {selectedArticle.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-lg bg-slate-900 text-[10px] text-amber-400/90 border border-slate-800 font-mono"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-12 rounded-3xl bg-[#0d1527] border border-slate-800 text-center text-slate-400 text-xs">
                  Select an article from the left to view documentation.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PROPOSE FEATURE / WISHLIST / TOPIC */}
      {newTopicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#0d1527] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Propose New Feature or Wishlist</h3>
                  <p className="text-[11px] text-slate-400">Share ideas with creators &amp; Cookie Chain builders</p>
                </div>
              </div>
              <button
                onClick={() => setNewTopicModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTopic} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as DiscussionCategory)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="wishlist">💡 Feature Wishlist / Inspired Addition</option>
                  <option value="idea">✨ Creator Idea &amp; Feedback</option>
                  <option value="dev_support">🛠️ Creator &amp; Dev Support</option>
                  <option value="news">📰 Ecosystem News Alpha</option>
                  <option value="update">🚀 Changelog / Platform Update</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Topic Title</label>
                <input
                  type="text"
                  placeholder="e.g. On-Chain Audio Visualizer Stems for Storefront..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Description &amp; Details</label>
                <textarea
                  rows={4}
                  placeholder="Explain why this feature would be awesome for creators on Cookie Chain..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="Wishlist, Audio, CreatorPage, Store"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewTopicModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newContent.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all shadow-md shadow-amber-500/20"
                >
                  Publish Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
