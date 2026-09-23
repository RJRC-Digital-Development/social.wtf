import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerAccountAsync, resetAccountStoreForTests, setAccountRolesAsync } from '../../src/lib/data/accountStore.ts';
import { getAuditLogsAsync, resetAuditStoreForTests } from '../../src/lib/data/auditStore.ts';
import { resetPlatformContentStoreForTests } from '../../src/lib/data/platformContentStore.ts';
import { DistributedStore, distributedStore } from '../../src/lib/security/distributedStore.ts';
import { clearStepUpCacheForTests, completeStepUpAsync, issueStepUpChallengeAsync } from '../../src/lib/security/rbac.ts';
import { createAccountSession, sessionRegistry, verifySessionToken } from '../../src/lib/security/session.ts';
import { POST as ownerPOST, PATCH as ownerPATCH } from '../../src/app/api/owner/publications/route.ts';
import { GET as publicGET } from '../../src/app/api/platform/publications/route.ts';

process.env.SESSION_SECRET = ['official', 'communications', 'security', 'test', '2026'].join('_');

function request(path, token, method = 'GET', body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
      'x-client-role': 'ROLE_PLATFORM_OWNER',
      'x-is-admin': 'true',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response) { return { status: response.status, body: await response.json() }; }

async function stepUp(account, token, password) {
  const verified = verifySessionToken(token);
  assert.equal(verified.valid, true);
  const challenge = await issueStepUpChallengeAsync(account.accountId, verified.payload.sessionId);
  const result = await completeStepUpAsync(account.accountId, challenge.challengeNonce, 'PASSWORD', password, verified.payload.sessionId);
  assert.equal(result.success, true);
  return result.stepUpToken;
}

async function runTests() {
  resetAccountStoreForTests(); resetAuditStoreForTests(); resetPlatformContentStoreForTests(); clearStepUpCacheForTests();
  distributedStore.clearLocalFallback(); sessionRegistry.clearAll();
  const owner = (await registerAccountAsync('official_owner', 'OwnerPassword123!')).account;
  const secondOwner = (await registerAccountAsync('second_owner', 'SecondOwnerPassword123!')).account;
  const ordinary = (await registerAccountAsync('ordinary_reader', 'ReaderPassword123!')).account;
  assert.ok(owner && secondOwner && ordinary);
  process.env.PLATFORM_OWNER_ACCOUNT_ID = owner.accountId;
  await setAccountRolesAsync(owner.accountId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(secondOwner.accountId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  await setAccountRolesAsync(ordinary.accountId, ['ROLE_USER']);
  const ownerToken = createAccountSession(owner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const ownerToken2 = createAccountSession(owner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const secondOwnerToken = createAccountSession(secondOwner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
  const forgedOrdinaryToken = createAccountSession(ordinary, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);

  console.log('[TEST 1] Ordinary and forged-client authority cannot mutate institutional publications');
  const forged = { category: 'COMING_SOON', title: 'Forged authority', body: 'Not authorized', priority: 1, actorAccountId: owner.accountId, publisherType: 'PLATFORM_OFFICIAL', status: 'PUBLISHED', role: 'ROLE_PLATFORM_OWNER', isAdmin: true };
  assert.equal((await ownerPOST(request('/api/owner/publications', forgedOrdinaryToken, 'POST', forged))).status, 403);
  const created = await json(await ownerPOST(request('/api/owner/publications', ownerToken, 'POST', { ...forged, title: '<script>alert(1)</script> roadmap', body: '<img src=x onerror=alert(1)> plain text' })));
  assert.equal(created.status, 201);
  assert.equal(created.body.publication.actorAccountId, owner.accountId);
  assert.equal(created.body.publication.publisherType, 'PLATFORM_OFFICIAL');
  assert.equal(created.body.publication.status, 'DRAFT');
  assert.match(created.body.publication.publicationId, /^pub_[a-f0-9]{32}$/);
  const id = created.body.publication.publicationId;
  for (const action of ['UPDATE', 'PUBLISH', 'ARCHIVE']) {
    assert.equal((await ownerPATCH(request('/api/owner/publications', forgedOrdinaryToken, 'PATCH', { publicationId: id, action, title: 'attack', stepUpToken: 'forged' }))).status, 403);
  }

  console.log('[TEST 2] Creation audit uses server actor and safe metadata only');
  const creationAudit = (await getAuditLogsAsync(20)).find((entry) => entry.action === 'PLATFORM_PUBLICATION_CREATE');
  assert.ok(creationAudit);
  assert.equal(creationAudit.actorAccountId, owner.accountId);
  assert.deepEqual(creationAudit.metadata, { category: 'COMING_SOON', status: 'DRAFT' });
  assert.doesNotMatch(JSON.stringify(creationAudit), /OwnerPassword|Bearer|stepUpToken|walletSignature|onerror/i);

  console.log('[TEST 3] Publish/archive require step-up and enforce account/session binding');
  assert.equal((await ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: id, action: 'PUBLISH' }))).status, 403);
  assert.equal((await ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: id, action: 'ARCHIVE' }))).status, 403);
  const wrongAccountStepUp = await stepUp(owner, ownerToken, 'OwnerPassword123!');
  assert.equal((await ownerPATCH(request('/api/owner/publications', secondOwnerToken, 'PATCH', { publicationId: id, action: 'PUBLISH', stepUpToken: wrongAccountStepUp }))).status, 403);
  const wrongSessionStepUp = await stepUp(owner, ownerToken, 'OwnerPassword123!');
  assert.equal((await ownerPATCH(request('/api/owner/publications', ownerToken2, 'PATCH', { publicationId: id, action: 'PUBLISH', stepUpToken: wrongSessionStepUp }))).status, 403);

  console.log('[TEST 4] First privileged use succeeds and replay fails');
  const publishToken = await stepUp(owner, ownerToken, 'OwnerPassword123!');
  assert.equal((await ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: id, action: 'PUBLISH', stepUpToken: publishToken }))).status, 200);
  assert.equal((await ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: id, action: 'ARCHIVE', stepUpToken: publishToken }))).status, 403);

  console.log('[TEST 5] Concurrent reuse yields exactly one successful privileged mutation');
  const draftA = await json(await ownerPOST(request('/api/owner/publications', ownerToken, 'POST', { category: 'IN_DEVELOPMENT', title: 'Concurrent A', body: 'A', priority: 1 })));
  const draftB = await json(await ownerPOST(request('/api/owner/publications', ownerToken, 'POST', { category: 'COMING_SOON', title: 'Concurrent B', body: 'B', priority: 1 })));
  const raceToken = await stepUp(owner, ownerToken, 'OwnerPassword123!');
  const race = await Promise.all([
    ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: draftA.body.publication.publicationId, action: 'PUBLISH', stepUpToken: raceToken })),
    ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: draftB.body.publication.publicationId, action: 'PUBLISH', stepUpToken: raceToken })),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 403]);

  console.log('[TEST 6] Distributed GETDEL status path is atomic under concurrent consumption');
  const values = new Map([['token:key', 'record']]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const [command, key] = JSON.parse(options.body);
    if (command !== 'GETDEL') return new Response(JSON.stringify({ result: null }), { status: 400 });
    const value = values.get(key) ?? null; values.delete(key);
    return Response.json({ result: value });
  };
  try {
    const store = new DistributedStore({ url: 'https://kv.test', token: 'test-token' });
    const consumed = await Promise.all([store.getdelWithStatus('token:key'), store.getdelWithStatus('token:key')]);
    assert.equal(consumed.filter((result) => result.ok && result.value === 'record').length, 1);
  } finally { globalThis.fetch = originalFetch; }

  console.log('[TEST 7] Public route returns only published records and no internal fields');
  const privateDraft = await json(await ownerPOST(request('/api/owner/publications', ownerToken, 'POST', { category: 'PLANNED_FEATURE', title: 'Private draft', body: 'Not published', priority: 1 })));
  const archivedDraft = await json(await ownerPOST(request('/api/owner/publications', ownerToken, 'POST', { category: 'FUTURE_PLAN', title: 'Archive me', body: 'Internal', priority: 2 })));
  const archiveToken = await stepUp(owner, ownerToken, 'OwnerPassword123!');
  assert.equal((await ownerPATCH(request('/api/owner/publications', ownerToken, 'PATCH', { publicationId: archivedDraft.body.publication.publicationId, action: 'ARCHIVE', stepUpToken: archiveToken }))).status, 200);
  const publicResponse = await json(await publicGET(request('/api/platform/publications')));
  assert.equal(publicResponse.status, 200);
  assert.ok(publicResponse.body.publications.some((item) => item.publicationId === id));
  assert.ok(!publicResponse.body.publications.some((item) => item.publicationId === archivedDraft.body.publication.publicationId));
  assert.ok(!publicResponse.body.publications.some((item) => item.publicationId === privateDraft.body.publication.publicationId));
  for (const item of publicResponse.body.publications) {
    for (const field of ['actorAccountId', 'status', 'createdAt', 'stepUpToken', 'sessionId', 'auditId']) assert.equal(field in item, false);
  }

  console.log('[TEST 8] Production persistence outage is 503, not a successful empty list');
  const previousNodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { assert.equal((await publicGET(request('/api/platform/publications'))).status, 503); }
  finally { process.env.NODE_ENV = previousNodeEnv; }

  console.log('[TEST 9] Public rendering uses React text nodes and exposes an outage state');
  const pageSource = fs.readFileSync(new URL('../../src/app/updates/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(pageSource, /dangerouslySetInnerHTML/);
  assert.match(pageSource, /Official updates are temporarily unavailable/);
  console.log('--- ALL OFFICIAL COMMUNICATIONS BEHAVIORAL SECURITY TESTS PASSED ---');
}

runTests().catch((error) => { console.error('Official communications test failure:', error); process.exit(1); });
