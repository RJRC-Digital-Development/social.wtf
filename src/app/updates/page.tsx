'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, ArrowLeft, Rocket, Wrench, CheckCircle2, Map, Radio } from 'lucide-react';

type Publication = { publicationId: string; publisher: string; category: string; title: string; body: string; pinned: boolean; priority: number; publishedAt: number | null; updatedAt: number };
const groups = [
  { title: 'Recently Installed', categories: ['RECENTLY_INSTALLED'], icon: CheckCircle2, tone: 'emerald' },
  { title: 'In Development', categories: ['IN_DEVELOPMENT'], icon: Wrench, tone: 'sky' },
  { title: 'Coming Soon', categories: ['COMING_SOON'], icon: Rocket, tone: 'amber' },
  { title: 'Planned / Future', categories: ['PLANNED_FEATURE', 'FUTURE_PLAN', 'FEATURE_REQUEST_UPDATE'], icon: Map, tone: 'violet' },
  { title: 'Platform Updates', categories: ['PLATFORM_UPDATE'], icon: Radio, tone: 'rose' },
];

export default function UpdatesPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    fetch('/api/platform/publications?limit=100')
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => { setItems(data.publications || []); setUnavailable(false); })
      .catch(() => { setItems([]); setUnavailable(true); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100">
      <div className="max-w-6xl mx-auto px-5 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" />Back to Social.wtf</Link>
        <section className="mt-10 rounded-[2rem] border border-amber-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/30 p-8 md:p-12 overflow-hidden">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300"><BadgeCheck className="w-4 h-4" />Social.wtf Official</div>
          <h1 className="mt-5 text-4xl md:text-6xl font-black tracking-tight">What’s new—and what’s next.</h1>
          <p className="mt-4 max-w-2xl text-slate-400">Authoritative platform updates, active development, near-term releases, and the longer roadmap—published directly by Social.wtf.</p>
        </section>
        {loading ? <p className="py-20 text-center text-slate-500">Loading official updates…</p> : unavailable ? (
          <div className="mt-10 rounded-2xl border border-amber-500/20 bg-slate-900 p-10 text-center text-slate-300">Official updates are temporarily unavailable.</div>
        ) : (
          <div className="mt-10 space-y-12">
            {groups.map((group) => {
              const entries = items.filter((item) => group.categories.includes(item.category));
              if (!entries.length) return null;
              const Icon = group.icon;
              return <section key={group.title}>
                <div className="flex items-center gap-3 mb-5"><div className="p-2 rounded-xl bg-slate-900 border border-slate-800"><Icon className="w-5 h-5 text-amber-400" /></div><h2 className="text-2xl font-black">{group.title}</h2></div>
                <div className="grid gap-4 md:grid-cols-2">
                  {entries.map((item) => <article key={item.publicationId} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
                    <div className="flex items-center justify-between gap-3"><span className="text-[11px] uppercase tracking-widest font-bold text-amber-400">{item.category.replaceAll('_', ' ')}</span>{item.pinned && <span className="text-[10px] rounded-full bg-amber-400/10 px-2 py-1 text-amber-300">Pinned</span>}</div>
                    <h3 className="mt-3 text-xl font-bold text-white">{item.title}</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{item.body}</p>
                    <div className="mt-5 flex items-center gap-1.5 text-xs text-slate-500"><BadgeCheck className="w-3.5 h-3.5 text-amber-400" />Social.wtf Official · {new Date(item.publishedAt || item.updatedAt).toLocaleDateString()}</div>
                  </article>)}
                </div>
              </section>;
            })}
            {!items.length && <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">No official updates have been published yet.</div>}
          </div>
        )}
      </div>
    </main>
  );
}
