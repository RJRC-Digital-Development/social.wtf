import { NextResponse } from 'next/server.js';
import crypto from 'crypto';
import {
  postsStore,
  getPublicPostsAsync,
  getAdultAuthorizedPostsAsync,
  getPostsByAuthorAsync,
  getPostByIdAsync,
  savePostAsync,
  updatePostAsync,
  deletePostAsync,
  PostStoreUnavailableError,
} from '../../../lib/data/postsStore.ts';
import { getProfileByWalletAsync } from '../../../lib/data/profileStore.ts';
import {
  getFriendsListAsync,
  areFriendsAsync,
  isAnyBlockedAsync,
  RelationshipStoreUnavailableError,
} from '../../../lib/data/relationshipStore.ts';
import { isClubMemberAsync, ClubStoreUnavailableError } from '../../../lib/data/clubStore.ts';
import {
  isAdultClubEnabled,
  isAdultEligibleAsync,
  classifyContent,
  authorizeClubReadAsync,
  authorizeClubWriteAsync,
} from '../../../lib/security/clubAuth.ts';
import { validateRequestSessionAsync } from '../../../lib/security/session.ts';
import { globalRateLimiter } from '../../../lib/security/rateLimiter.ts';
import { sanitizeString } from '../../../lib/security/sanitize.ts';
import { getClientIp } from '../../../lib/security/ipHelper.ts';
import type { Post, ShieldClassification } from '../../../types/index.ts';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const authorFilter = url.searchParams.get('author') || url.searchParams.get('creator');
    const postId = url.searchParams.get('id');
    const scopeParam = url.searchParams.get('scope');

    // Authentication Gate: SIWS required for feed access
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: sessionResult.reason || 'Authentication required to access feed.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const callerWallet = sessionResult.payload.walletAddress || sessionResult.payload.accountId;
    const friends = await getFriendsListAsync(callerWallet);
    const authorizedAuthors = new Set([callerWallet, ...friends]);

    // 1. Direct post lookup by ID
    if (postId) {
      const post = await getPostByIdAsync(postId);
      if (!post) {
        return NextResponse.json({ error: 'Post not found', code: 'POST_NOT_FOUND' }, { status: 404 });
      }

      const postAuthorWallet = post.author.walletAddress;
      const isBlocked = await isAnyBlockedAsync(callerWallet, postAuthorWallet);
      if (isBlocked) {
        return NextResponse.json({ error: 'Post not found', code: 'POST_NOT_FOUND' }, { status: 404 });
      }

      const isAuthorizedRelationship = postAuthorWallet === callerWallet || (await areFriendsAsync(callerWallet, postAuthorWallet));
      if (!isAuthorizedRelationship) {
        return NextResponse.json({ error: 'Post not found', code: 'POST_NOT_FOUND' }, { status: 404 });
      }

      // Check sensitive post authorization
      if (post.isShielded || post.shieldCategory === 'age_restricted') {
        const clubRead = await authorizeClubReadAsync(callerWallet, postAuthorWallet);
        if (!clubRead.authorized) {
          // Fail private: generic 404
          return NextResponse.json({ error: 'Post not found', code: 'POST_NOT_FOUND' }, { status: 404 });
        }
      }

      // Quarantined / rejected posts never visible
      if (post.shieldCategory === 'quarantined' || post.shieldCategory === 'rejected') {
        return NextResponse.json({ error: 'Post not found', code: 'POST_NOT_FOUND' }, { status: 404 });
      }

      return NextResponse.json({ success: true, post });
    }

    // 2. Club scope feed query
    if (scopeParam === 'club') {
      const isAdult = await isAdultEligibleAsync(callerWallet);
      const isMember = await isClubMemberAsync(callerWallet);

      if (!isAdult || !isMember) {
        return NextResponse.json(
          { error: 'Club authorization required', code: 'CLUB_AUTH_REQUIRED' },
          { status: 403 }
        );
      }

      let clubPosts: Post[] = [];
      if (authorFilter) {
        const isSelf = authorFilter === callerWallet;
        const isFriend = !isSelf && (await areFriendsAsync(callerWallet, authorFilter));
        const isBlocked = await isAnyBlockedAsync(callerWallet, authorFilter);

        if ((!isSelf && !isFriend) || isBlocked) {
          return NextResponse.json({ posts: [], total: 0 });
        }

        const authorPosts = await getPostsByAuthorAsync(authorFilter);
        clubPosts = authorPosts.filter((p) => (p.isShielded || p.shieldCategory === 'age_restricted') && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
      } else {
        const postPromises = Array.from(authorizedAuthors).map(async (authWallet) => {
          const blocked = await isAnyBlockedAsync(callerWallet, authWallet);
          if (blocked) return [];
          const authorPosts = await getPostsByAuthorAsync(authWallet);
          return authorPosts.filter((p) => (p.isShielded || p.shieldCategory === 'age_restricted') && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
        });
        const postArrays = await Promise.all(postPromises);
        clubPosts = postArrays.flat();
        clubPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      return NextResponse.json({ posts: clubPosts, total: clubPosts.length });
    }

    // 3. Normal public / friend feed query
    // INVARIANT: Normal feed NEVER exposes sensitive, age_restricted, quarantined, or rejected posts
    let posts: Post[] = [];

    if (authorFilter) {
      const isSelf = authorFilter === callerWallet;
      const isFriend = !isSelf && (await areFriendsAsync(callerWallet, authorFilter));
      const isBlocked = await isAnyBlockedAsync(callerWallet, authorFilter);

      if ((!isSelf && !isFriend) || isBlocked) {
        return NextResponse.json({ posts: [], total: 0 });
      }

      const authorPosts = await getPostsByAuthorAsync(authorFilter);
      posts = authorPosts.filter((p) => !p.isShielded && p.shieldCategory !== 'age_restricted' && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
    } else {
      const postPromises = Array.from(authorizedAuthors).map(async (authWallet) => {
        const blocked = await isAnyBlockedAsync(callerWallet, authWallet);
        if (blocked) return [];
        const authorPosts = await getPostsByAuthorAsync(authWallet);
        return authorPosts.filter((p) => !p.isShielded && p.shieldCategory !== 'age_restricted' && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
      });
      const postArrays = await Promise.all(postPromises);
      posts = postArrays.flat();
      posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return NextResponse.json({
      posts,
      total: posts.length,
    });
  } catch (err: any) {
    if (
      err instanceof PostStoreUnavailableError ||
      err?.code === 'POST_STORE_UNAVAILABLE' ||
      err instanceof RelationshipStoreUnavailableError ||
      err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE' ||
      err instanceof ClubStoreUnavailableError ||
      err?.code === 'CLUB_STORE_UNAVAILABLE'
    ) {
      return NextResponse.json(
        { error: 'Post service temporarily unavailable', code: 'POST_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    console.error('[API/Posts GET] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve posts', code: 'POST_FETCH_ERROR' },
      { status: 500 }
    );
  }
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

  // Authorization: Must be an authenticated user via SIWS
  const sessionResult = await validateRequestSessionAsync(req);
  if (!sessionResult.authenticated) {
    return NextResponse.json(
      { error: sessionResult.reason || 'Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  const walletAddress = sessionResult.payload.walletAddress || sessionResult.payload.accountId;
  const scope = sessionResult.payload.scope;

  const body = await req.json().catch(() => ({}));
  const content = sanitizeString(body.content || '', 2000);

  // Production Media Freeze: Reject all user-supplied media URLs
  if (
    body.mediaUrl ||
    body.imageUrl ||
    body.videoUrl ||
    body.audioUrl ||
    body.attachmentUrl
  ) {
    return NextResponse.json(
      {
        error: 'Media posting is temporarily disabled. Only text posts are currently supported.',
        code: 'MEDIA_TEMPORARILY_DISABLED',
      },
      { status: 400 }
    );
  }

  if (!content) {
    return NextResponse.json(
      { error: 'Post must contain text content.', code: 'CONTENT_REQUIRED' },
      { status: 400 }
    );
  }

  // 1. Authoritative Sentinel Classification
  const classificationResult = classifyContent(content);

  if (classificationResult.classification === 'rejected') {
    return NextResponse.json(
      { error: 'Post content violates safety policy and was rejected.', code: 'PROHIBITED_CONTENT' },
      { status: 400 }
    );
  }

  const isServerSensitive = classificationResult.classification === 'sensitive';
  const isClientShielded = Boolean(body.isShielded);
  const isSensitive = isServerSensitive || isClientShielded;
  const isUncertain = classificationResult.classification === 'uncertain';

  let shieldCategory: ShieldClassification = 'safe';
  let isShielded = false;

  if (isUncertain) {
    isShielded = true;
    shieldCategory = 'quarantined';
  } else if (isSensitive) {
    isShielded = true;
    shieldCategory = 'age_restricted';
  }

  // Server-Side Kill Switch: If Adult Club is disabled, reject all sensitive posts
  if (isShielded || shieldCategory === 'age_restricted') {
    const isClubEnabled = isAdultClubEnabled();
    if (!isClubEnabled) {
      return NextResponse.json(
        {
          error: 'Secret Adult Club is currently disabled. Sensitive content cannot be published.',
          code: 'ADULT_CLUB_DISABLED',
        },
        { status: 403 }
      );
    }

    // Sensitive write authorization check: author must have adult eligibility AND club membership
    const writeAuth = await authorizeClubWriteAsync(walletAddress);
    if (!writeAuth.authorized) {
      const code = !isAdultClubEnabled() ? 'ADULT_CLUB_DISABLED' : 'CLUB_MEMBERSHIP_REQUIRED';
      return NextResponse.json(
        { error: writeAuth.reason || 'Creating sensitive/club content requires active club membership and adult eligibility.', code },
        { status: writeAuth.status || 403 }
      );
    }
  }

  // 2. Authoritative Profile Derivation
  let authorHandle = sessionResult.payload.username || (walletAddress.length > 8 ? walletAddress.slice(0, 8) : walletAddress);
  let authorName = `@${authorHandle}`;
  let authorAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${walletAddress}`;
  let isAgeVerified = false;
  let isVerified = false;

  try {
    const existingProfile = await getProfileByWalletAsync(walletAddress);
    if (existingProfile) {
      if (existingProfile.handle) authorHandle = existingProfile.handle;
      if (existingProfile.name) authorName = existingProfile.name;
      if (existingProfile.avatar) authorAvatar = existingProfile.avatar;
      if (existingProfile.ageVerified) isAgeVerified = true;
      if (existingProfile.verified === true) isVerified = true;
    }
  } catch {
    // Non-fatal profile fallback
  }

  // Canonical server-constructed Post record
  const newPost: Post = {
    id: `post-${crypto.randomUUID()}`,
    author: {
      id: sessionResult.payload.accountId || `user-${walletAddress}`,
      handle: authorHandle,
      name: authorName,
      avatar: authorAvatar,
      bio: 'Cookie Chain Creator',
      verified: isVerified,
      ageVerified: isAgeVerified,
      walletAddress,
      followersCount: 0,
      followingCount: 0,
      isCreator: scope === 'creator' || scope === 'admin',
    },
    content,
    type: 'text',
    mediaUrl: undefined,
    likes: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: Array.isArray(body.tags)
      ? body.tags.map((t: string) => sanitizeString(t, 50))
      : ['CookieChain'],
    createdAt: new Date().toISOString(),
    isShielded,
    shieldCategory,
    shieldReason: isUncertain ? classificationResult.reason : undefined,
  };

  try {
    const savedPost = await savePostAsync(newPost);
    return NextResponse.json(
      {
        success: true,
        post: savedPost,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof PostStoreUnavailableError || err?.code === 'POST_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Post service temporarily unavailable', code: 'POST_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to persist post', code: 'POST_PERSIST_ERROR' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  return handleUpdatePost(req);
}

export async function PATCH(req: Request) {
  return handleUpdatePost(req);
}

async function handleUpdatePost(req: Request) {
  const ip = getClientIp(req);

  // Rate limiting: 20 updates per minute per IP
  const rateCheck = await globalRateLimiter.checkAsync(`post:update:${ip}`, 20, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment.' },
      { status: 429 }
    );
  }

  // Authorization: Must be authenticated via SIWS
  const sessionResult = await validateRequestSessionAsync(req);
  if (!sessionResult.authenticated) {
    return NextResponse.json(
      { error: sessionResult.reason || 'Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  const walletAddress = sessionResult.payload.walletAddress || sessionResult.payload.accountId;
  const body = await req.json().catch(() => ({}));
  const postId = body.id || body.postId;

  if (!postId || typeof postId !== 'string') {
    return NextResponse.json(
      { error: 'Post ID is required.', code: 'POST_ID_REQUIRED' },
      { status: 400 }
    );
  }

  const content = body.content !== undefined ? sanitizeString(body.content || '', 2000) : undefined;
  if (content !== undefined && !content.trim()) {
    return NextResponse.json(
      { error: 'Post content cannot be empty.', code: 'CONTENT_REQUIRED' },
      { status: 400 }
    );
  }

  let isShielded = body.isShielded;
  let shieldCategory: ShieldClassification | undefined = undefined;
  let shieldReason: string | undefined = undefined;

  if (content) {
    const classificationResult = classifyContent(content);
    if (classificationResult.classification === 'rejected') {
      return NextResponse.json(
        { error: 'Edited content violates safety policy and was rejected.', code: 'PROHIBITED_CONTENT' },
        { status: 400 }
      );
    }
    const isServerSensitive = classificationResult.classification === 'sensitive';
    const isClientShielded = Boolean(body.isShielded);
    const isSensitive = isServerSensitive || isClientShielded;
    const isUncertain = classificationResult.classification === 'uncertain';

    if (isUncertain) {
      isShielded = true;
      shieldCategory = 'quarantined';
      shieldReason = classificationResult.reason;
    } else if (isSensitive) {
      isShielded = true;
      shieldCategory = 'age_restricted';
    } else {
      shieldCategory = 'safe';
      isShielded = false;
    }
  }

  try {
    const updatedPost = await updatePostAsync(postId, walletAddress, {
      content,
      tags: Array.isArray(body.tags) ? body.tags.map((t: string) => sanitizeString(t, 50)) : undefined,
      isShielded,
      shieldCategory,
      shieldReason,
    });

    return NextResponse.json({
      success: true,
      post: updatedPost,
    });
  } catch (err: any) {
    if (err instanceof PostStoreUnavailableError || err?.code === 'POST_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Post service temporarily unavailable', code: 'POST_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    if (err?.message?.includes('Unauthorized')) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: 403 }
      );
    }
    if (err?.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Post not found', code: 'POST_NOT_FOUND' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: err?.message || 'Failed to update post', code: 'POST_UPDATE_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  // Authorization: Must be authenticated
  const sessionResult = await validateRequestSessionAsync(req);
  if (!sessionResult.authenticated) {
    return NextResponse.json(
      { error: sessionResult.reason || 'Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  const walletAddress = sessionResult.payload.walletAddress || sessionResult.payload.accountId;
  const isAdmin = sessionResult.payload.scope === 'admin';

  const url = new URL(req.url);
  let postId = url.searchParams.get('id') || url.searchParams.get('postId');

  if (!postId) {
    const body = await req.json().catch(() => ({}));
    postId = body.id || body.postId;
  }

  if (!postId || typeof postId !== 'string') {
    return NextResponse.json(
      { error: 'Post ID is required.', code: 'POST_ID_REQUIRED' },
      { status: 400 }
    );
  }

  try {
    const deleted = await deletePostAsync(postId, walletAddress, isAdmin);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Post not found or already deleted', code: 'POST_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedId: postId,
    });
  } catch (err: any) {
    if (err instanceof PostStoreUnavailableError || err?.code === 'POST_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Post service temporarily unavailable', code: 'POST_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    if (err?.message?.includes('Unauthorized')) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: err?.message || 'Failed to delete post', code: 'POST_DELETE_ERROR' },
      { status: 500 }
    );
  }
}
