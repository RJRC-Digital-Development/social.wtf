import { NextResponse } from 'next/server.js';
import {
  getAllProductsAsync,
  getProductsByCreatorAsync,
  saveProductAsync,
} from '../../../lib/data/productsStore.ts';
import { validateRequestSessionAsync } from '../../../lib/security/session.ts';
import { globalRateLimiter } from '../../../lib/security/rateLimiter.ts';
import { getClientIp } from '../../../lib/security/ipHelper.ts';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const creator = searchParams.get('creator');

    if (creator) {
      const result = await getProductsByCreatorAsync(creator);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Authoritative product store is unavailable' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: true, products: result.products || [] });
    }

    const result = await getAllProductsAsync();
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Authoritative product store is unavailable' },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, products: result.products || [] });
  } catch (err) {
    console.error('[API Products GET Error]:', err);
    return NextResponse.json(
      { error: 'Internal server error retrieving products' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await globalRateLimiter.checkAsync(`product_create:${ip}`, 30, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before creating more products.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    // Authenticate caller via SIWS session
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated || !auth.payload?.walletAddress) {
      return NextResponse.json(
        { error: 'Authentication required to list digital products on storefront' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Security Invariant: creatorWallet is derived strictly from the authenticated SIWS session
    const authenticatedWallet = auth.payload.walletAddress;

    const result = await saveProductAsync(authenticatedWallet, body);

    if (!result.success) {
      const isServiceUnavailable = result.error?.toLowerCase().includes('unavailable');
      return NextResponse.json(
        { error: result.error || 'Failed to create product' },
        { status: isServiceUnavailable ? 503 : 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        product: result.product,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API Products POST Error]:', err);
    return NextResponse.json(
      { error: 'Internal server error processing product creation' },
      { status: 500 }
    );
  }
}
