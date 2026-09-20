import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { accountHasCapabilityAsync } from '@/lib/security/rbac';
import { listAllAccountsAsync } from '@/lib/data/accountStore';
import { getAllPostsAsync } from '@/lib/data/postsStore';
import { getEffectiveFeatureStateAsync } from '@/lib/data/featureStore';
import { distributedStore } from '@/lib/security/distributedStore';

export async function GET(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { accountId } = sessionResult.payload;
    const canReadTelemetry = await accountHasCapabilityAsync(accountId, 'telemetry:read');
    if (!canReadTelemetry) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Account lacks telemetry:read capability.' },
        { status: 403 }
      );
    }

    // Measure real metrics
    const accounts = await listAllAccountsAsync(1000);
    const posts = await getAllPostsAsync();
    const featureState = await getEffectiveFeatureStateAsync();

    const persistenceHealth = distributedStore.isConfigured() ? 'CONFIGURED' : 'MEMORY_FALLBACK';

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      metrics: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter((a) => a.status === 'ACTIVE').length,
        suspendedAccounts: accounts.filter((a) => a.status === 'SUSPENDED').length,
        totalPosts: posts.length,
      },
      system: {
        persistence: persistenceHealth,
        environment: process.env.NODE_ENV || 'development',
        adultClubEffective: featureState.adultClub,
        mediaEffective: featureState.mediaCreation,
        registrationEffective: featureState.registration,
      },
      deploymentGates: {
        ADULT_CLUB_ENABLED: featureState.deploymentLimits.adultClubAllowed ? 'ALLOWED' : 'DISABLED_BY_DEPLOYMENT',
        MEDIA_POSTING: 'DISABLED_BY_POLICY',
      },
    });
  } catch (err: any) {
    console.error('[Owner Overview Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
