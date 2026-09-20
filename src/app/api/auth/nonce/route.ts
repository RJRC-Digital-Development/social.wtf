import { NextResponse } from 'next/server.js';
import { generateAuthChallengeAsync, formatChallengeMessage } from '../../../../lib/security/walletAuth.ts';
import { globalRateLimiter } from '../../../../lib/security/rateLimiter.ts';
import { getClientIp } from '../../../../lib/security/ipHelper.ts';
import { PublicKey } from '@solana/web3.js';

async function handleNonceRequest(walletAddress: string | null, ip: string) {
  // Distributed Rate Limit: 15 nonce requests per minute per IP
  const rateCheck = await globalRateLimiter.checkAsync(`nonce:${ip}`, 15, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many authentication requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
    );
  }

  if (!walletAddress || typeof walletAddress !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 });
  }

  // Validate Base58 public key format
  try {
    new PublicKey(walletAddress);
  } catch {
    return NextResponse.json({ error: 'Malformed Solana wallet public key' }, { status: 400 });
  }

  const challenge = await generateAuthChallengeAsync(walletAddress);
  const message = formatChallengeMessage(challenge);

  return NextResponse.json({
    nonce: challenge.nonce,
    message,
    expiresAt: challenge.expiresAt,
  });
}

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('walletAddress');
    return await handleNonceRequest(walletAddress, ip);
  } catch {
    return NextResponse.json({ error: 'Failed to generate authentication challenge' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const body = await req.json().catch(() => ({}));
    const { walletAddress } = body;
    return await handleNonceRequest(walletAddress, ip);
  } catch {
    return NextResponse.json({ error: 'Failed to generate authentication challenge' }, { status: 500 });
  }
}

