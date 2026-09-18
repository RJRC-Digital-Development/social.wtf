import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import {
  getAuthorizationClaimsAsync,
  createAuthorizationToken,
  authorizeRequest,
  AuthorizationPolicy,
} from '@/lib/security/authorization';

export async function GET(req: Request) {
  const sessionResult = await validateRequestSessionAsync(req);

  if (!sessionResult.authenticated) {
    return NextResponse.json(
      {
        authenticated: false,
        authorized: false,
        error: sessionResult.reason || 'Authentication required.',
      },
      { status: 401 }
    );
  }

  const { walletAddress, scope } = sessionResult.payload;
  const claims = await getAuthorizationClaimsAsync(walletAddress, scope);
  const authToken = createAuthorizationToken(claims);

  return NextResponse.json({
    authenticated: true,
    authorized: true,
    walletAddress,
    scope: claims.scope,
    isAdultAuthorized: claims.isAdultAuthorized,
    claims,
    authToken,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const permission = body.permission || body.checkPermission;

    let policy: AuthorizationPolicy = {};

    if (permission === 'adult_entertainment') {
      policy = { requireAdultAccess: true };
    } else if (permission === 'creator_studio') {
      policy = { requiredScope: 'creator' };
    } else if (permission === 'admin') {
      policy = { requiredScope: 'admin' };
    }

    const authResult = await authorizeRequest(req, policy);

    if (!authResult.authorized) {
      return NextResponse.json(
        {
          permitted: false,
          code: authResult.code,
          error: authResult.error,
        },
        { status: authResult.status }
      );
    }

    return NextResponse.json({
      permitted: true,
      walletAddress: authResult.claims.walletAddress,
      scope: authResult.claims.scope,
      claims: authResult.claims,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error evaluating authorization request.' },
      { status: 500 }
    );
  }
}
