import { NextResponse } from 'next/server';
import { generateAuthChallenge, formatChallengeMessage } from '@/lib/security/walletAuth';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import { PublicKey } from '@solana/web3.js';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    
    // Rate limit: 15 nonce requests per minute per IP
    const rateCheck = globalRateLimiter.check(`nonce:${ip}`, 15, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many authentication requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { walletAddress } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 });
    }

    // Validate Base58 public key format
    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: 'Malformed Solana wallet public key' }, { status: 400 });
    }

    const challenge = generateAuthChallenge(walletAddress);
    const message = formatChallengeMessage(challenge);

    return NextResponse.json({
      nonce: challenge.nonce,
      message,
      expiresAt: challenge.expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate authentication challenge' },
      { status: 500 }
    );
  }
}
