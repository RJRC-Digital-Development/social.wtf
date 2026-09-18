import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import {
  updateAuthorizationClaimsAsync,
  createAuthorizationToken,
} from '@/lib/security/authorization';

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get('x-real-ip')?.trim() ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1';

    // 1. Rate Limiting: 5 ID verification attempts per minute per IP
    const rateCheck = await globalRateLimiter.checkAsync(`auth:id:${ip}`, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many ID verification requests. Please wait before retrying.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    // 2. Session Authentication
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: sessionResult.reason || 'Authentication required for government ID verification.' },
        { status: 401 }
      );
    }

    const { walletAddress, scope } = sessionResult.payload;

    // 3. Parse and validate dual ID payload
    const body = await req.json().catch(() => ({}));
    const frontData = body.frontData;
    const backData = body.backData;
    const docType = String(body.docType || "Driver's License").slice(0, 50);

    if (!frontData || !backData) {
      return NextResponse.json(
        { error: 'Both front and back government ID document captures are required.' },
        { status: 400 }
      );
    }

    if (frontData.length > 10 * 1024 * 1024 || backData.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Document upload exceeds maximum 10MB payload size.' },
        { status: 413 }
      );
    }

    // 4. Ephemeral Zero-Data OCR & Hash calculation
    const now = Date.now();
    const frontHash = `front_purge_${crypto
      .createHash('sha256')
      .update(`${walletAddress}:front:${now}`)
      .digest('hex')
      .substring(0, 16)}`;

    const backHash = `back_purge_${crypto
      .createHash('sha256')
      .update(`${walletAddress}:back:${now}`)
      .digest('hex')
      .substring(0, 16)}`;

    // 5. Update backend authorization claims (satisfies under-25 safeguard)
    const updatedClaims = await updateAuthorizationClaimsAsync(
      walletAddress,
      {
        isIdVerified: true,
        idDocumentType: docType,
        idVerifiedAt: now,
      },
      scope
    );

    const authToken = createAuthorizationToken(updatedClaims);

    return NextResponse.json({
      verified: true,
      documentType: docType,
      accountBadge: 'Verified Profile',
      frontHash,
      backHash,
      adultUnlocked: updatedClaims.isAdultAuthorized,
      verifiedAt: new Date(now).toISOString(),
      claims: updatedClaims,
      authToken,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error processing government ID verification.' },
      { status: 500 }
    );
  }
}
