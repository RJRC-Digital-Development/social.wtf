import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import { accountHasCapabilityAsync } from '../../../../lib/security/rbac.ts';
import { listAllAccountsAsync } from '../../../../lib/data/accountStore.ts';
import { getAllPostsAsync } from '../../../../lib/data/postsStore.ts';
import { FeatureStateUnavailableError, getEffectiveFeatureStateAsync } from '../../../../lib/data/featureStore.ts';
import { distributedStore } from '../../../../lib/security/distributedStore.ts';

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
    if (err instanceof FeatureStateUnavailableError) {
      return NextResponse.json(
        { error: 'FEATURE_STATE_UNAVAILABLE', message: 'Authoritative feature state is temporarily unavailable.' },
        { status: 503 }
      );
    }
    console.error('[Owner Overview Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
