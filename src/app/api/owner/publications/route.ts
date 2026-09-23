import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import { accountHasCapabilityAsync, consumeStepUpTokenAsync } from '../../../../lib/security/rbac.ts';
import { createPlatformPublicationAsync, listPlatformPublicationsAsync, updatePlatformPublicationAsync } from '../../../../lib/data/platformContentStore.ts';
import { recordAuditLogAsync } from '../../../../lib/data/auditStore.ts';
import { extractAuditContext } from '../../../../lib/security/auditContext.ts';

async function authorize(req: Request) {
  const session = await validateRequestSessionAsync(req);
  if (!session.authenticated) return { error: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  if (!await accountHasCapabilityAsync(session.payload.accountId, 'platform:publish')) {
    return { error: NextResponse.json({ error: 'FORBIDDEN', message: 'Account lacks platform:publish capability.' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: Request) {
  try {
    const auth = await authorize(req);
    if (auth.error) return auth.error;
    return NextResponse.json({ success: true, publications: await listPlatformPublicationsAsync(100) });
  } catch {
    return NextResponse.json({ error: 'PERSISTENCE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorize(req);
    if (auth.error || !auth.session?.authenticated) return auth.error;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    const publication = await createPlatformPublicationAsync(auth.session.payload.accountId, body);
    const { ipHash, userAgentHash } = extractAuditContext(req);
    await recordAuditLogAsync({
      actorAccountId: auth.session.payload.accountId,
      capabilityUsed: 'platform:publish',
      action: 'PLATFORM_PUBLICATION_CREATE',
      targetType: 'PLATFORM_PUBLICATION',
      targetId: publication.publicationId,
      ipHash,
      userAgentHash,
      outcome: 'SUCCESS',
      metadata: { category: publication.category, status: publication.status },
    });
    return NextResponse.json({ success: true, publication }, { status: 201 });
  } catch (error: any) {
    const unavailable = error?.message === 'PERSISTENCE_UNAVAILABLE';
    return NextResponse.json({ error: unavailable ? 'PERSISTENCE_UNAVAILABLE' : 'INVALID_PUBLICATION', message: error?.message }, { status: unavailable ? 503 : 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authorize(req);
    if (auth.error || !auth.session?.authenticated) return auth.error;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    const { publicationId, action = 'UPDATE', stepUpToken } = body as Record<string, any>;
    if (!['UPDATE', 'PUBLISH', 'ARCHIVE'].includes(action)) return NextResponse.json({ error: 'ACTION_INVALID' }, { status: 400 });
    if ((action === 'PUBLISH' || action === 'ARCHIVE') && !await consumeStepUpTokenAsync(auth.session.payload.accountId, stepUpToken, auth.session.payload.sessionId)) {
      return NextResponse.json({ error: 'STEP_UP_REQUIRED', message: 'Publishing and archiving require step-up authentication.' }, { status: 403 });
    }
    const publication = await updatePlatformPublicationAsync(publicationId, auth.session.payload.accountId, body, action);
    const { ipHash, userAgentHash } = extractAuditContext(req);
    await recordAuditLogAsync({
      actorAccountId: auth.session.payload.accountId,
      capabilityUsed: 'platform:publish',
      action: `PLATFORM_PUBLICATION_${action}`,
      targetType: 'PLATFORM_PUBLICATION',
      targetId: publication.publicationId,
      ipHash,
      userAgentHash,
      stepUpMethodUsed: action === 'UPDATE' ? undefined : 'PASSWORD',
      outcome: 'SUCCESS',
      metadata: { category: publication.category, status: publication.status },
    });
    return NextResponse.json({ success: true, publication });
  } catch (error: any) {
    const unavailable = error?.message === 'PERSISTENCE_UNAVAILABLE';
    const missing = error?.message === 'PUBLICATION_NOT_FOUND';
    return NextResponse.json({ error: unavailable ? 'PERSISTENCE_UNAVAILABLE' : missing ? 'NOT_FOUND' : 'INVALID_PUBLICATION', message: error?.message }, { status: unavailable ? 503 : missing ? 404 : 400 });
  }
}
