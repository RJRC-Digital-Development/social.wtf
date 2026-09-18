import { NextResponse } from 'next/server';
import { INITIAL_POSTS } from '@/lib/data/mockData';
import { authorizeRequest } from '@/lib/security/authorization';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import { sanitizeString } from '@/lib/security/sanitize';
import { Post } from '@/types';

// In-memory posts array for API serving
let platformPosts: Post[] = [...INITIAL_POSTS];

export async function GET(req: Request) {
  // Check authorization for Adult Entertainment access
  const adultAuth = await authorizeRequest(req, { requireAdultAccess: true });

  if (adultAuth.authorized) {
    // Authorized user with valid Card + Video + (ID if under 25): Return all posts
    return NextResponse.json({
      posts: platformPosts,
      adultAccessGranted: true,
      total: platformPosts.length,
    });
  }

  // Zero-trace server-side shielding: Completely remove all shielded adult posts
  const publicPosts = platformPosts.filter((p) => !p.isShielded);

  return NextResponse.json({
    posts: publicPosts,
    adultAccessGranted: false,
    total: publicPosts.length,
  });
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1';

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
  const isShielded = Boolean(body.isShielded);

  if (!content && !mediaUrl) {
    return NextResponse.json(
      { error: 'Post must contain either text content or media.' },
      { status: 400 }
    );
  }

  // If user attempts to create a shielded/adult post, verify they are adult-authorized
  if (isShielded && !authResult.claims.isAdultAuthorized) {
    return NextResponse.json(
      { error: 'Creating Adult Entertainment posts requires verified 18+ adult authorization on your account.' },
      { status: 403 }
    );
  }

  const newPost: Post = {
    id: `post-${Date.now()}`,
    author: {
      id: `usr-${walletAddress.slice(0, 8)}`,
      handle: walletAddress.slice(0, 8),
      name: `User ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
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
    tags: Array.isArray(body.tags) ? body.tags.map((t: string) => sanitizeString(t, 50)) : ['CookieChain'],
    createdAt: 'Just now',
    isShielded,
    shieldCategory: isShielded ? 'age_restricted' : 'safe',
  };

  platformPosts = [newPost, ...platformPosts];

  return NextResponse.json({
    success: true,
    post: newPost,
  });
}
