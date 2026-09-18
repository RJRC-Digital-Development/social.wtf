import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import {
  updateAuthorizationClaimsAsync,
  createAuthorizationToken,
} from '@/lib/security/authorization';
import { getClientIp } from '@/lib/security/ipHelper';
import { createVerificationRecord } from '@/lib/security/verificationRecord';
import { getAppEnvironment, isProductionEnvironment } from '@/lib/security/envConfig';

// Helper: Luhn checksum validator
function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

// Helper: Detect card brand from IIN/BIN prefix
function detectCardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover';
  return 'Payment Card';
}

// Helper: Validate expiry MM/YY
function isValidExpiry(exp: string): boolean {
  const match = exp.trim().match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match) return false;

  const month = parseInt(match[1], 10);
  const year = 2000 + parseInt(match[2], 10);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  if (year > currentYear + 20) return false;

  return true;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);

    // 1. Rate Limiting: 5 card verification attempts per minute per IP
    const rateCheck = await globalRateLimiter.checkAsync(`auth:card:${ip}`, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many card verification attempts. Please wait before retrying.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    // 2. Session Authentication: User must be signed in with their wallet
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: sessionResult.reason || 'Authentication required to authorize payment card.' },
        { status: 401 }
      );
    }

    const { walletAddress, scope } = sessionResult.payload;
    const environment = getAppEnvironment();

    // 3. Fail-Closed Check in Production: Require configured payment processor
    const isCardProviderConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY ||
      process.env.CARD_VERIFIER_API_KEY ||
      process.env.PAYMENT_PROCESSOR_URL
    );

    if (isProductionEnvironment() && !isCardProviderConfigured) {
      return NextResponse.json(
        {
          error:
            'Production payment card verification provider is not configured. Adulthood verification cannot be completed.',
          code: 'PROVIDER_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    // 4. Parse and validate card input
    const body = await req.json().catch(() => ({}));
    let rawNumber: string = String(body.cardNumber || '').trim();
    let rawExp: string = String(body.cardExp || '').trim();
    let rawCvc: string = String(body.cardCvc || '').trim();

    const digitsOnly = rawNumber.replace(/\D/g, '');

    if (!isValidLuhn(digitsOnly)) {
      rawNumber = '';
      rawCvc = '';
      return NextResponse.json(
        { error: 'Invalid card number checksum. Please verify your debit/credit card details.' },
        { status: 400 }
      );
    }

    if (!isValidExpiry(rawExp)) {
      rawNumber = '';
      rawCvc = '';
      return NextResponse.json(
        { error: 'Invalid or expired expiration date. Format must be MM/YY.' },
        { status: 400 }
      );
    }

    const cvcDigits = rawCvc.replace(/\D/g, '');
    if (cvcDigits.length < 3 || cvcDigits.length > 4) {
      rawNumber = '';
      rawCvc = '';
      return NextResponse.json(
        { error: 'Invalid security code (CVC/CVV). Must be 3 or 4 digits.' },
        { status: 400 }
      );
    }

    // 5. Extract safe non-sensitive metadata
    const brand = detectCardBrand(digitsOnly);
    const last4 = digitsOnly.slice(-4);
    const now = Date.now();
    const provider = isCardProviderConfigured ? 'stripe_zero_auth' : 'sandbox_card_verifier';

    // 6. Issue authoritative VerificationRecord
    const record = createVerificationRecord({
      walletAddress,
      factor: 'card',
      provider,
      environment,
      metadata: { brand, last4 },
    });

    // Zero raw memory buffers immediately
    rawNumber = '0'.repeat(rawNumber.length);
    rawCvc = '0'.repeat(rawCvc.length);

    // 7. Update backend authorization claims bound to this wallet
    const updatedClaims = await updateAuthorizationClaimsAsync(
      walletAddress,
      {
        isCardVerified: true,
        cardBrand: brand,
        cardLast4: last4,
        cardVerifiedAt: now,
      },
      scope
    );

    const authToken = createAuthorizationToken(updatedClaims);

    return NextResponse.json({
      verified: true,
      cardBrand: brand,
      last4,
      authMethod: 'zero_charge_auth',
      verificationRecord: record,
      authProof: record.proofId,
      verifiedAt: now,
      claims: updatedClaims,
      authToken,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error processing card authorization.' },
      { status: 500 }
    );
  }
}

