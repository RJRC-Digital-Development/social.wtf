import { NextResponse } from 'next/server.js';
import {
  getAllProductsAsync,
  getProductsByCreatorAsync,
  saveProductAsync,
  updateProductAsync,
  deleteProductAsync,
} from '../../../lib/data/productsStore.ts';
import {
  getFriendsListAsync,
  areFriendsAsync,
  isAnyBlockedAsync,
  RelationshipStoreUnavailableError,
} from '../../../lib/data/relationshipStore.ts';
import { validateRequestSessionAsync } from '../../../lib/security/session.ts';
import { globalRateLimiter } from '../../../lib/security/rateLimiter.ts';
import { getClientIp } from '../../../lib/security/ipHelper.ts';

export async function GET(req: Request) {
  try {
    // Authenticate caller via session
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required to view storefront products', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const callerWallet = auth.payload.walletAddress || auth.payload.accountId;
    const { searchParams } = new URL(req.url);
    const creator = searchParams.get('creator');

    if (creator) {
      const isSelf = creator === callerWallet;
      const isFriend = !isSelf && (await areFriendsAsync(callerWallet, creator));

      if (!isSelf && !isFriend) {
        return NextResponse.json({ success: true, products: [] });
      }

      if (!isSelf && (await isAnyBlockedAsync(callerWallet, creator))) {
        return NextResponse.json({ success: true, products: [] });
      }

      const result = await getProductsByCreatorAsync(creator);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Authoritative product store is unavailable' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: true, products: result.products || [] });
    }

    // Return products authored strictly by caller and accepted friends
    const friends = await getFriendsListAsync(callerWallet);
    const permittedCreators = [callerWallet, ...friends];

    const productPromises = permittedCreators.map((cWallet) =>
      getProductsByCreatorAsync(cWallet).catch(() => ({ success: true, products: [] }))
    );
    const results = await Promise.all(productPromises);
    const combinedProducts = results
      .filter((r) => r.success && Array.isArray(r.products))
      .flatMap((r) => r.products!);

    return NextResponse.json({ success: true, products: combinedProducts });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
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

    // Authenticate caller via session
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required to list digital products on storefront' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Security Invariant: creatorWallet is derived strictly from the authenticated session
    const authenticatedWallet = auth.payload.walletAddress || auth.payload.accountId;

    const result = await saveProductAsync(authenticatedWallet, body);

    if (!result.success) {
      const isServiceUnavailable = result.error?.toLowerCase().includes('unavailable');
      return NextResponse.json(
        { error: result.error || 'Failed to create product' },
        { status: isServiceUnavailable ? 503 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      product: result.product,
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error processing product listing' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  return handleUpdateProduct(req);
}

export async function PATCH(req: Request) {
  return handleUpdateProduct(req);
}

async function handleUpdateProduct(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await globalRateLimiter.checkAsync(`product_update:${ip}`, 30, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before updating products.' },
        { status: 429 }
      );
    }

    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required to edit products', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const authenticatedWallet = auth.payload.walletAddress || auth.payload.accountId;
    const body = await req.json().catch(() => ({}));
    const productId = body.id || body.productId;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json(
        { error: 'Product ID is required', code: 'PRODUCT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const result = await updateProductAsync(productId, authenticatedWallet, body);

    if (!result.success) {
      const isServiceUnavailable = result.error?.toLowerCase().includes('unavailable');
      const isUnauthorized = result.error?.toLowerCase().includes('unauthorized');
      const isNotFound = result.error?.toLowerCase().includes('not found');
      const status = isServiceUnavailable ? 503 : isUnauthorized ? 403 : isNotFound ? 404 : 400;

      return NextResponse.json(
        { error: result.error || 'Failed to update product' },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      product: result.product,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error processing product update' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required to delete products', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const authenticatedWallet = auth.payload.walletAddress || auth.payload.accountId;
    const isAdmin = auth.payload.scope === 'admin';

    const url = new URL(req.url);
    let productId = url.searchParams.get('id') || url.searchParams.get('productId');

    if (!productId) {
      const body = await req.json().catch(() => ({}));
      productId = body.id || body.productId;
    }

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json(
        { error: 'Product ID is required', code: 'PRODUCT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const result = await deleteProductAsync(productId, authenticatedWallet, isAdmin);

    if (!result.success) {
      const isServiceUnavailable = result.error?.toLowerCase().includes('unavailable');
      const isUnauthorized = result.error?.toLowerCase().includes('unauthorized');
      const isNotFound = result.error?.toLowerCase().includes('not found');
      const status = isServiceUnavailable ? 503 : isUnauthorized ? 403 : isNotFound ? 404 : 400;

      return NextResponse.json(
        { error: result.error || 'Failed to delete product' },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      deletedId: productId,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error processing product deletion' },
      { status: 500 }
    );
  }
}
