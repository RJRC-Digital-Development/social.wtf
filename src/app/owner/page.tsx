'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  FileText,
  Activity,
  Lock,
  Power,
  Key,
  Database,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowLeft,
  Megaphone,
} from 'lucide-react';
import Link from 'next/link';

export default function OwnerDashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'moderation' | 'system' | 'audit' | 'commerce' | 'publications'>('overview');
  const [overviewData, setOverviewData] = useState<any>(null);
  const [accountsData, setAccountsData] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publications, setPublications] = useState<any[]>([]);
  const [editingPublicationId, setEditingPublicationId] = useState<string | null>(null);
  const [publicationForm, setPublicationForm] = useState({ category: 'COMING_SOON', title: '', body: '', pinned: false, priority: 0 });

  const [stepUpChallengeNonce, setStepUpChallengeNonce] = useState<string | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [stepUpActive, setStepUpActive] = useState(false);
  const [stepUpActionCallback, setStepUpActionCallback] = useState<((freshToken: string) => Promise<void>) | null>(null);
  const [stepUpExpiresAt, setStepUpExpiresAt] = useState<number | null>(null);

  // Auth gate state
  const [authVerified, setAuthVerified] = useState(false);
  const [authDenied, setAuthDenied] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);

  const clearPrivilegedState = () => {
    setAuthVerified(false);
    setAuthDenied(true);
    setCurrentAccountId(null);
    setStepUpChallengeNonce(null);
    setStepUpPassword('');
    setStepUpToken(null);
    setStepUpActive(false);
    setStepUpActionCallback(null);
    setStepUpExpiresAt(null);
  };

  const rejectIfUnauthorized = (res: Response): boolean => {
    if (res.status === 401 || res.status === 403) {
      clearPrivilegedState();
      return true;
    }
    return false;
  };

  // Verify session and check privileged role before rendering anything
  useEffect(() => {
    let cancelled = false;
    const verifyAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          if (!cancelled) setAuthDenied(true);
          return;
        }
        const data = await res.json();
        if (!data.authenticated || !data.account?.accountId) {
          if (!cancelled) setAuthDenied(true);
          return;
        }
        const capabilities: string[] = data.capabilities || [];
        const isPrivileged = capabilities.includes('telemetry:read');
        if (!isPrivileged) {
          if (!cancelled) setAuthDenied(true);
          return;
        }
        if (!cancelled) {
          setCurrentAccountId(data.account.accountId);
          setAuthVerified(true);
        }
      } catch {
        if (!cancelled) setAuthDenied(true);
      }
    };
    verifyAuth();
    return () => { cancelled = true; };
  }, []);

  // Auto-clear step-up token after 5 minutes
  useEffect(() => {
    if (!stepUpToken || !stepUpExpiresAt) return;
    const remaining = stepUpExpiresAt - Date.now();
    if (remaining <= 0) {
      setStepUpToken(null);
      setStepUpExpiresAt(null);
      return;
    }
    const timer = setTimeout(() => {
      setStepUpToken(null);
      setStepUpExpiresAt(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [stepUpToken, stepUpExpiresAt]);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/owner/overview');
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (!res.ok) {
        setError(data.message || data.error || 'Failed to load owner overview');
        return;
      }
      setOverviewData(data);
    } catch (err: any) {
      setError(err?.message || 'Network error');
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/owner/accounts');
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (res.ok && data.success) {
        setAccountsData(data.accounts || []);
      }
    } catch {}
  };

  const fetchAudit = async () => {
    try {
      const res = await fetch('/api/owner/audit');
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (res.ok && data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch {}
  };

  const fetchPublications = async () => {
    const res = await fetch('/api/owner/publications');
    const data = await res.json();
    if (rejectIfUnauthorized(res)) return;
    if (res.ok) setPublications(data.publications || []);
  };

  useEffect(() => {
    if (!authVerified) return;
    setLoading(true);
    Promise.all([fetchOverview(), fetchAccounts(), fetchAudit(), fetchPublications()]).finally(() => {
      setLoading(false);
    });
  }, [authVerified]);

  const resetPublicationForm = () => {
    setEditingPublicationId(null);
    setPublicationForm({ category: 'COMING_SOON', title: '', body: '', pinned: false, priority: 0 });
  };

  const savePublication = async () => {
    const res = await fetch('/api/owner/publications', {
      method: editingPublicationId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPublicationId ? { ...publicationForm, publicationId: editingPublicationId, action: 'UPDATE' } : publicationForm),
    });
    const data = await res.json();
    if (rejectIfUnauthorized(res)) return;
    if (!res.ok) return setError(data.message || data.error || 'Failed to save publication');
    resetPublicationForm();
    await fetchPublications();
  };

  const changePublicationStatus = async (publicationId: string, action: 'PUBLISH' | 'ARCHIVE') => {
    const execute = async (activeToken = stepUpToken) => {
      const res = await fetch('/api/owner/publications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicationId, action, stepUpToken: activeToken }),
      });
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (!res.ok) return setError(data.message || data.error || `Failed to ${action.toLowerCase()} publication`);
      await fetchPublications();
    };
    if (!stepUpToken) await handleRequestStepUp(execute); else await execute();
  };

  const handleRequestStepUp = async (onSuccess: (freshToken: string) => Promise<void>) => {
    try {
      const res = await fetch('/api/owner/step-up/challenge', { method: 'POST' });
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (res.ok && data.success) {
        setStepUpChallengeNonce(data.challengeNonce);
        setStepUpActionCallback(() => onSuccess);
        setStepUpActive(true);
      } else {
        alert(data.message || 'Failed to initiate step-up challenge');
      }
    } catch (err: any) {
      alert(err?.message || 'Step-up initiation error');
    }
  };

  const handleVerifyStepUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepUpChallengeNonce || !stepUpPassword) return;

    try {
      const res = await fetch('/api/owner/step-up/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeNonce: stepUpChallengeNonce,
          method: 'PASSWORD',
          password: stepUpPassword,
        }),
      });

      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (res.ok && data.success && data.stepUpToken) {
        setStepUpToken(data.stepUpToken);
        setStepUpExpiresAt(Date.now() + (data.expiresInSeconds || 300) * 1000);
        setStepUpActive(false);
        setStepUpPassword('');
        if (stepUpActionCallback) {
          await stepUpActionCallback(data.stepUpToken);
          setStepUpActionCallback(null);
        }
      } else {
        alert(data.message || 'Step-up verification failed');
      }
    } catch (err: any) {
      alert(err?.message || 'Step-up error');
    }
  };

  const handleToggleKillSwitch = async (feature: string, currentValue: boolean) => {
    const doUpdate = async () => {
      const res = await fetch('/api/owner/system/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: { [feature]: !currentValue },
          stepUpToken,
          reason: `Toggled ${feature} from owner dashboard`,
        }),
      });
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (!res.ok) {
        alert(data.message || data.error || 'Failed to update feature');
      } else {
        await fetchOverview();
        await fetchAudit();
        alert('Feature state updated successfully');
      }
    };

    if (!stepUpToken) {
      await handleRequestStepUp(doUpdate);
    } else {
      await doUpdate();
    }
  };

  const handleSuspendAccount = async (accountId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const doUpdate = async () => {
      const res = await fetch(`/api/owner/accounts/${accountId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          stepUpToken,
          reason: `Status changed to ${nextStatus} via Owner Dashboard`,
        }),
      });
      const data = await res.json();
      if (rejectIfUnauthorized(res)) return;
      if (!res.ok) {
        alert(data.message || data.error || 'Failed to update account status');
      } else {
        await fetchAccounts();
        await fetchAudit();
        alert(`Account ${nextStatus.toLowerCase()} successfully.`);
      }
    };

    if (!stepUpToken) {
      await handleRequestStepUp(doUpdate);
    } else {
      await doUpdate();
    }
  };

  // Auth gate: deny access before rendering any dashboard content
  if (authDenied) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <ShieldAlert className="w-16 h-16 text-rose-400 mx-auto" />
          <h1 className="text-2xl font-black text-white">Access Denied</h1>
          <p className="text-sm text-slate-400">
            This console requires an authenticated account with platform owner or administrator privileges.
            Unauthorized access attempts are logged and monitored.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Social.wtf</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!authVerified) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-amber-400 mx-auto animate-pulse" />
          <p className="text-sm text-slate-400 font-semibold">Verifying authorization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col">
      {/* Owner Header */}
      <header className="owner-dashboard-header border-b border-slate-800 bg-slate-950/80 px-6 py-4 sticky top-0 z-30 backdrop-blur-md">
        <div className="owner-dashboard-identity flex items-center gap-4 min-w-0">
          <Link
            href="/"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-400 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit to App</span>
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="font-extrabold text-base tracking-tight text-white truncate">
              Social<span className="text-amber-400">.wtf</span> Owner Console
            </h1>
          </div>
        </div>

        <div className="owner-dashboard-controls flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-bold">
            ROLE_PLATFORM_OWNER
          </span>
          {stepUpToken ? (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Step-Up Active</span>
            </span>
          ) : (
            <button
              onClick={() => handleRequestStepUp(async () => {})}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Step-Up Auth</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Layout with Sidebar */}
      <div className="page-shell dashboard-grid flex-1 py-6">
        {/* Navigation Sidebar */}
        <aside className="space-y-1.5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
              activeTab === 'accounts'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Accounts</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
              activeTab === 'system'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>Kill Switches</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
              activeTab === 'audit'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Audit Trail</span>
          </button>

          <button
            onClick={() => setActiveTab('publications')}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
              activeTab === 'publications' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            <span>Official Communications</span>
          </button>
        </aside>

        {/* Content Pane */}
        <main className="dashboard-content space-y-6">
          {error ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {activeTab === 'overview' && overviewData && (
            <div className="space-y-6">
              {/* Metrics Grid */}
              <div className="metrics-grid">
                <div className="min-w-0 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Real Member Count</span>
                  <div className="text-2xl font-black text-white">{overviewData.metrics?.totalAccounts || 0}</div>
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {overviewData.metrics?.activeAccounts || 0} active accounts
                  </span>
                </div>

                <div className="min-w-0 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Real Text Posts</span>
                  <div className="text-2xl font-black text-white">{overviewData.metrics?.totalPosts || 0}</div>
                  <span className="text-[11px] text-slate-400">Authoritative persistent posts</span>
                </div>

                <div className="min-w-0 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Distributed Storage</span>
                  <div className="text-lg font-bold text-amber-300">{overviewData.system?.persistence}</div>
                  <span className="text-[11px] text-slate-400">Upstash Redis / KV Gateway</span>
                </div>
              </div>

              {/* Deployment & Subsystem Gates */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Deployment Invariants &amp; Subsystems</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Secret Adult Club</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        overviewData.system?.adultClubEffective ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {overviewData.system?.adultClubEffective ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Deployment Gate: {overviewData.deploymentGates?.ADULT_CLUB_ENABLED}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Media Uploads</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">
                        FROZEN (#4B PENDING)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Policy: {overviewData.deploymentGates?.MEDIA_POSTING}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-white">Canonical Member Directory</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Account ID</th>
                      <th className="py-2.5 px-3">Username</th>
                      <th className="py-2.5 px-3">Bound Wallet</th>
                      <th className="py-2.5 px-3">Roles</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {accountsData.map((acc) => (
                      <tr key={acc.accountId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 font-mono text-slate-400">{acc.accountId.slice(0, 12)}...</td>
                        <td className="py-3 px-3 font-bold text-white">@{acc.username}</td>
                        <td className="py-3 px-3 font-mono">
                          {acc.primaryWalletAddress ? (
                            <span className="text-amber-300">{acc.primaryWalletAddress.slice(0, 6)}...{acc.primaryWalletAddress.slice(-4)}</span>
                          ) : (
                            <span className="text-slate-600 italic">No wallet bound</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono">
                            {acc.roles?.join(', ')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            acc.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {acc.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleSuspendAccount(acc.accountId, acc.status)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors"
                          >
                            {acc.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'system' && overviewData && (
            <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-6">
              <div>
                <h3 className="font-bold text-sm text-white">Authoritative Kill Switches</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Two-layer system controls. Modifying sensitive switches requires Step-Up authentication.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-white block">User Registration</span>
                    <span className="text-[11px] text-slate-400 block">
                      Controls whether new accounts can register on the platform
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggleKillSwitch('registrationEnabled', overviewData.system?.registrationEffective)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      overviewData.system?.registrationEffective
                        ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                    }`}
                  >
                    {overviewData.system?.registrationEffective ? 'Disable Registration' : 'Enable Registration'}
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between opacity-75">
                  <div>
                    <span className="font-bold text-xs text-white block">Secret Adult Club</span>
                    <span className="text-[11px] text-slate-400 block">
                      Deployment Gate prohibits runtime activation until Repair #4B is complete
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-500 text-xs font-semibold">
                    Deployment Locked (OFF)
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'publications' && (
            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div><h3 className="font-bold text-white">Official Communications</h3><p className="text-xs text-slate-400 mt-1">Publish institutional updates independently from personal posts and friendships.</p></div>
                <div className="grid md:grid-cols-2 gap-3">
                  <select value={publicationForm.category} onChange={(e) => setPublicationForm({ ...publicationForm, category: e.target.value })} className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm">
                    <option value="COMING_SOON">Coming Soon</option><option value="IN_DEVELOPMENT">In Development</option><option value="RECENTLY_INSTALLED">Recently Installed</option><option value="PLATFORM_UPDATE">Platform Update</option><option value="FUTURE_PLAN">Future Plan</option><option value="PLANNED_FEATURE">Planned Feature</option><option value="FEATURE_REQUEST_UPDATE">Feature Request Update</option>
                  </select>
                  <input type="number" min={0} max={100} value={publicationForm.priority} onChange={(e) => setPublicationForm({ ...publicationForm, priority: Number(e.target.value) })} className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm" placeholder="Priority 0–100" />
                </div>
                <input maxLength={120} value={publicationForm.title} onChange={(e) => setPublicationForm({ ...publicationForm, title: e.target.value })} className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm" placeholder="Title" />
                <textarea maxLength={5000} rows={7} value={publicationForm.body} onChange={(e) => setPublicationForm({ ...publicationForm, body: e.target.value })} className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm resize-y" placeholder="Plain-text official update" />
                <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={publicationForm.pinned} onChange={(e) => setPublicationForm({ ...publicationForm, pinned: e.target.checked })} /> Pin this publication</label>
                <div className="flex gap-2"><button onClick={savePublication} className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold">{editingPublicationId ? 'Save Changes' : 'Create Draft'}</button>{editingPublicationId && <button onClick={resetPublicationForm} className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold">Cancel</button>}</div>
              </div>
              <div className="space-y-3">
                {publications.map((publication) => <article key={publication.publicationId} className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex flex-wrap justify-between gap-3"><div><span className="text-[10px] font-bold text-amber-400">{publication.category.replaceAll('_', ' ')}</span><h4 className="font-bold text-white mt-1">{publication.title}</h4></div><span className="text-xs font-bold text-slate-400">{publication.status}</span></div>
                  <p className="mt-3 text-sm text-slate-400 whitespace-pre-wrap line-clamp-4">{publication.body}</p>
                  <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => { setEditingPublicationId(publication.publicationId); setPublicationForm({ category: publication.category, title: publication.title, body: publication.body, pinned: publication.pinned, priority: publication.priority }); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs">Edit</button>{publication.status !== 'PUBLISHED' && publication.status !== 'ARCHIVED' && <button onClick={() => changePublicationStatus(publication.publicationId, 'PUBLISH')} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs">Publish</button>}{publication.status !== 'ARCHIVED' && <button onClick={() => changePublicationStatus(publication.publicationId, 'ARCHIVE')} className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs">Archive</button>}</div>
                </article>)}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-white">Privileged Action Audit Trail</h3>
              <div className="space-y-2.5">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">No privileged mutations recorded yet.</p>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.auditId}
                      className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-300">{log.action}</span>
                          <span className="text-slate-500">&bull;</span>
                          <span className="font-mono text-slate-400">{log.actorAccountId.slice(0, 10)}...</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Target: {log.targetType} ({log.targetId}) {log.reason ? ` - ${log.reason}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300">
                          {log.outcome}
                        </span>
                        <span className="text-[10px] text-slate-500 block pt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Step-Up Authentication Modal */}
      {stepUpActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <Key className="w-5 h-5" />
              <h3 className="font-bold text-base text-white">Step-Up Authentication Required</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This high-risk action requires cryptographic re-authentication. Confirm your password or hardware key to proceed.
            </p>

            <form onSubmit={handleVerifyStepUp} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/80 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStepUpActive(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
                >
                  Authorize Step-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
