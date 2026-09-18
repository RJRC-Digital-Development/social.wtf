import { NextResponse } from 'next/server';
import { postsStore } from '@/lib/data/postsStore';
import { authorizeRequest } from '@/lib/security/authorization';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import { sanitizeString } from '@/lib/security/sanitize';
import { getClientIp } from '@/lib/security/ipHelper';
import { Post, ShieldClassification } from '@/types';

// Server-side content scanner helper
function detectRestrictedContent(text: string, mediaUrl?: string): boolean {
  const combined = `${text} ${mediaUrl || ''}`.toLowerCase();
  return (
    combined.includes('nsfw') ||
    combined.includes('adult') ||
    combined.includes('18+') ||
    combined.includes('nude') ||
    combined.includes('explicit') ||
    combined.includes('restricted') ||
    combined.includes('shield')
  );
}

export async function GET(req: Request) {
  // Check authorization for Adult Entertainment access
  const adultAuth = await authorizeRequest(req, { requireAdultAccess: true });

  if (adultAuth.authorized) {
    // Authorized user with valid Card + Video + (ID if under 25): Return adult authorized posts
    const posts = await postsStore.getAdultAuthorizedPosts();
    return NextResponse.json({
      posts,
      adultAccessGranted: true,
      total: posts.length,
    });
  }

  // Zero-trace server-side shielding: Completely remove all shielded adult posts
  const publicPosts = await postsStore.getPublicPosts();

  return NextResponse.json({
    posts: publicPosts,
    adultAccessGranted: false,
    total: publicPosts.length,
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);

  // Rate limiting: 10 posts per minute per IP
  const rateCheck = await globalRateLimiter.checkAsync(`post:create:${ip}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Post creation rate limit exceeded. Please wait a moment.' },
      { status: 429 }
    );
  }

  // Authorization: Must be an authenticated user
  const authResult = await authorizeRequest(req, { requiredScope: 'user' });
  if (!authResult.authorized) {
    return NextResponse.json(
      { error: authResult.error, code: authResult.code },
      { status: authResult.status }
    );
  }

  const { walletAddress } = authResult.session;

  const body = await req.json().catch(() => ({}));
  const content = sanitizeString(body.content || '', 2000);
  const mediaType = body.mediaType || 'text';
  const mediaUrl = body.mediaUrl ? sanitizeString(body.mediaUrl, 500) : undefined;

  if (!content && !mediaUrl) {
    return NextResponse.json(
      { error: 'Post must contain either text content or media.' },
      { status: 400 }
    );
  }

  // Server-owned content classification: NEVER trust client isShielded claim alone
  const isContentFlagged = detectRestrictedContent(content, mediaUrl);
  const isClientShielded = Boolean(body.isShielded);
  const isShielded = isContentFlagged || isClientShielded;
  const shieldCategory: ShieldClassification = isShielded ? 'age_restricted' : 'safe';

  // If content is classified as shielded/adult, verify author is 18+ adult-authorized
  if (isShielded && !authResult.claims.isAdultAuthorized) {
    return NextResponse.json(
      {
        error:
          'Creating Adult Entertainment posts requires verified 18+ adult authorization on your account.',
        code: 'ADULT_AUTH_REQUIRED',
      },
      { status: 403 }
    );
  }

  const newPost: Post = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author: {
      id: `usr-${walletAddress.slice(0, 8)}`,
      handle: walletAddress.slice(0, 8),
      name: `User ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      bio: 'Cookie Chain Creator',
      verified: true,
      ageVerified: authResult.claims.isAdultAuthorized,
      walletAddress,
      followersCount: 1,
      followingCount: 1,
      isCreator: authResult.claims.scope === 'creator',
    },
    content,
    type: (mediaType as any) || 'text',
    mediaUrl,
    likes: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: string) => sanitizeString(t, 50))
      : ['CookieChain'],
    createdAt: 'Just now',
    isShielded,
    shieldCategory,
  };

  await postsStore.addPost(newPost);

  return NextResponse.json({
    success: true,
    post: newPost,
  });
}

