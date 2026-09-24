import assert from 'node:assert/strict';
import { registerAccountAsync, resetAccountStoreForTests, setAccountRolesAsync } from '../../src/lib/data/accountStore.ts';
import {
  FeatureStateUnavailableError,
  getEffectiveFeatureStateAsync,
  getRuntimeFeatureStateAsync,
  resetFeatureStoreForTests,
  updateRuntimeFeatureStateAsync,
} from '../../src/lib/data/featureStore.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';
import { clearStepUpCacheForTests, completeStepUpAsync, issueStepUpChallengeAsync } from '../../src/lib/security/rbac.ts';
import { createAccountSession, sessionRegistry } from '../../src/lib/security/session.ts';
import { POST as registerPOST } from '../../src/app/api/auth/register/route.ts';
import { GET as overviewGET } from '../../src/app/api/owner/overview/route.ts';
import { POST as killSwitchPOST } from '../../src/app/api/owner/system/kill-switch/route.ts';

process.env.SESSION_SECRET = ['feature', 'state', 'authority', 'test', '2026'].join('_');
process.env.ADULT_CLUB_ENABLED = 'false';

function request(path, token, body) {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function runTests() {
  const originalIsConfigured = distributedStore.isConfigured.bind(distributedStore);
  const originalGetWithStatus = distributedStore.getWithStatus.bind(distributedStore);
  const originalSet = distributedStore.set.bind(distributedStore);
  let configured = false;
  let featureRead = { ok: true, value: null };
  distributedStore.isConfigured = () => configured;
  distributedStore.getWithStatus = async (key) => key === 'platform:system:features' ? featureRead : originalGetWithStatus(key);
  distributedStore.set = async (key, value, ttl) => originalSet(key, value, ttl);

  try {
    resetAccountStoreForTests(); resetFeatureStoreForTests(); clearStepUpCacheForTests();
    distributedStore.clearLocalFallback(); sessionRegistry.clearAll();

    console.log('[TEST 1] Unconfigured store retains intentional local development fallback');
    configured = false;
    assert.equal((await updateRuntimeFeatureStateAsync({ registrationEnabled: false })).success, true);
    assert.equal((await getRuntimeFeatureStateAsync()).registrationEnabled, false);

    console.log('[TEST 2] Configured authoritative record overrides stale process memory');
    configured = true;
    featureRead = { ok: true, value: JSON.stringify({ adultClubEnabled: true, mediaCreationEnabled: true, registrationEnabled: true }) };
    const authoritative = await getRuntimeFeatureStateAsync();
    assert.deepEqual(authoritative, { adultClubEnabled: true, mediaCreationEnabled: true, registrationEnabled: true });
    const effective = await getEffectiveFeatureStateAsync();
    assert.equal(effective.adultClub, false);
    assert.equal(effective.mediaCreation, false);
    assert.equal(effective.registration, true);

    console.log('[TEST 3] Legitimately absent authoritative record uses documented safe defaults');
    featureRead = { ok: true, value: null };
    assert.deepEqual(await getRuntimeFeatureStateAsync(), { adultClubEnabled: false, mediaCreationEnabled: false, registrationEnabled: true });

    console.log('[TEST 4] Malformed authoritative JSON is unavailable');
    featureRead = { ok: true, value: '{not-json' };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);

    console.log('[TEST 5] Existing empty authoritative record is unavailable');
    featureRead = { ok: true, value: '{}' };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);

    console.log('[TEST 6] Existing record missing registration state is unavailable');
    featureRead = { ok: true, value: JSON.stringify({ adultClubEnabled: false, mediaCreationEnabled: false }) };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);

    console.log('[TEST 7] Non-boolean authoritative registration state is unavailable');
    featureRead = { ok: true, value: JSON.stringify({ adultClubEnabled: false, mediaCreationEnabled: false, registrationEnabled: 'false' }) };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);

    console.log('[TEST 8] Existing record missing Adult or Media state is unavailable');
    featureRead = { ok: true, value: JSON.stringify({ mediaCreationEnabled: false, registrationEnabled: false }) };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);
    featureRead = { ok: true, value: JSON.stringify({ adultClubEnabled: false, registrationEnabled: false }) };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);

    console.log('[TEST 9] Valid complete authoritative record still works');
    featureRead = { ok: true, value: JSON.stringify({ adultClubEnabled: false, mediaCreationEnabled: false, registrationEnabled: false }) };
    assert.deepEqual(await getRuntimeFeatureStateAsync(), { adultClubEnabled: false, mediaCreationEnabled: false, registrationEnabled: false });

    console.log('[TEST 10] Confirmed absence still produces documented defaults after invalid records');
    featureRead = { ok: true, value: null };
    assert.deepEqual(await getRuntimeFeatureStateAsync(), { adultClubEnabled: false, mediaCreationEnabled: false, registrationEnabled: true });

    console.log('[TEST 11] Authoritative read outage never falls back to stale permissive memory');
    configured = false;
    resetFeatureStoreForTests();
    assert.equal((await getRuntimeFeatureStateAsync()).registrationEnabled, true);
    configured = true;
    featureRead = { ok: false, value: null };
    await assert.rejects(getRuntimeFeatureStateAsync, FeatureStateUnavailableError);
    await assert.rejects(getEffectiveFeatureStateAsync, FeatureStateUnavailableError);

    console.log('[TEST 12] Registration fails closed with 503 during feature-authority outage');
    const registration = await registerPOST(request('/api/auth/register', null, { username: 'outage_user', password: 'OutagePassword123!' }));
    assert.equal(registration.status, 503);
    assert.equal((await registration.json()).error, 'FEATURE_STATE_UNAVAILABLE');

    const owner = (await registerAccountAsync('feature_owner', 'OwnerPassword123!')).account;
    assert.ok(owner);
    process.env.PLATFORM_OWNER_ACCOUNT_ID = owner.accountId;
    configured = true;
    featureRead = { ok: true, value: null };
    await setAccountRolesAsync(owner.accountId, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);
    const ownerToken = createAccountSession(owner, ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']);

    console.log('[TEST 13] Owner overview explicitly reports authoritative feature outage');
    configured = true;
    featureRead = { ok: false, value: null };
    const overview = await overviewGET(request('/api/owner/overview', ownerToken));
    assert.equal(overview.status, 503);
    assert.equal((await overview.json()).error, 'FEATURE_STATE_UNAVAILABLE');

    console.log('[TEST 14] Kill-switch outage cannot resurrect stale permissive state');
    configured = false;
    const challenge = await issueStepUpChallengeAsync(owner.accountId);
    const elevated = await completeStepUpAsync(owner.accountId, challenge.challengeNonce, 'PASSWORD', 'OwnerPassword123!');
    assert.equal(elevated.success, true);
    configured = true;
    featureRead = { ok: false, value: null };
    const toggle = await killSwitchPOST(request('/api/owner/system/kill-switch', ownerToken, {
      updates: { registrationEnabled: true }, stepUpToken: elevated.stepUpToken, reason: 'outage test',
    }));
    assert.equal(toggle.status, 503);
    assert.equal((await toggle.json()).error, 'FEATURE_STATE_UNAVAILABLE');

    console.log('[TEST 15] RBAC and deployment clamps remain authoritative');
    configured = false;
    assert.equal((await getEffectiveFeatureStateAsync()).adultClub, false);
    assert.equal((await getEffectiveFeatureStateAsync()).mediaCreation, false);
    const ordinary = (await registerAccountAsync('feature_ordinary', 'OrdinaryPassword123!')).account;
    const ordinaryToken = createAccountSession(ordinary, ['ROLE_PLATFORM_OWNER']);
    const denied = await overviewGET(request('/api/owner/overview', ordinaryToken));
    assert.equal(denied.status, 403, 'Forged session role must not bypass authoritative RBAC');

    console.log('--- ALL AUTHORITATIVE FEATURE-STATE TESTS PASSED ---');
  } finally {
    distributedStore.isConfigured = originalIsConfigured;
    distributedStore.getWithStatus = originalGetWithStatus;
    distributedStore.set = originalSet;
  }
}

runTests().catch((error) => { console.error('Feature-state authority test failure:', error); process.exit(1); });
