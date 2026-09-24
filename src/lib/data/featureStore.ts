import { distributedStore } from '../security/distributedStore.ts';
import type { SystemFeatureState } from '../../types/account.ts';

const FEATURE_KEY = 'platform:system:features';

const DEFAULT_FEATURE_STATE: SystemFeatureState = {
  adultClubEnabled: false,
  mediaCreationEnabled: false,
  registrationEnabled: true,
};

export class FeatureStateUnavailableError extends Error {
  constructor(message = 'Authoritative feature state is unavailable') {
    super(message);
    this.name = 'FeatureStateUnavailableError';
  }
}

let memoryFeatureState: SystemFeatureState = { ...DEFAULT_FEATURE_STATE };

function normalizeFeatureState(value: unknown): SystemFeatureState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FeatureStateUnavailableError('Authoritative feature state is invalid');
  }
  const parsed = value as Partial<SystemFeatureState>;
  if (
    typeof parsed.adultClubEnabled !== 'boolean'
    || typeof parsed.mediaCreationEnabled !== 'boolean'
    || typeof parsed.registrationEnabled !== 'boolean'
  ) {
    throw new FeatureStateUnavailableError('Authoritative feature state is invalid');
  }
  return {
    adultClubEnabled: parsed.adultClubEnabled,
    mediaCreationEnabled: parsed.mediaCreationEnabled,
    registrationEnabled: parsed.registrationEnabled,
  };
}

/**
 * Check deployment level authorization
 */
export function getDeploymentFeatureLimits(): {
  adultClubAllowed: boolean;
  mediaAllowed: boolean;
} {
  return {
    adultClubAllowed: process.env.ADULT_CLUB_ENABLED === 'true',
    mediaAllowed: false, // Locked until #4B private media infrastructure is implemented
  };
}

/**
 * Get the authoritative runtime feature state
 */
export async function getRuntimeFeatureStateAsync(): Promise<SystemFeatureState> {
  if (distributedStore.isConfigured()) {
    const result = await distributedStore.getWithStatus(FEATURE_KEY);
    if (!result.ok) throw new FeatureStateUnavailableError();
    if (result.value === null) return { ...DEFAULT_FEATURE_STATE };
    try {
      const authoritative = normalizeFeatureState(JSON.parse(result.value));
      memoryFeatureState = { ...authoritative };
      return authoritative;
    } catch {
      throw new FeatureStateUnavailableError('Authoritative feature state is invalid');
    }
  }

  return { ...memoryFeatureState };
}

/**
 * Calculate effective feature state:
 * effective = deploymentAllows && runtimeAllows
 */
export async function getEffectiveFeatureStateAsync(): Promise<{
  adultClub: boolean;
  mediaCreation: boolean;
  registration: boolean;
  deploymentLimits: {
    adultClubAllowed: boolean;
    mediaAllowed: boolean;
  };
  runtimeState: SystemFeatureState;
}> {
  const deployment = getDeploymentFeatureLimits();
  const runtime = await getRuntimeFeatureStateAsync();

  return {
    adultClub: deployment.adultClubAllowed && runtime.adultClubEnabled,
    mediaCreation: deployment.mediaAllowed && runtime.mediaCreationEnabled,
    registration: runtime.registrationEnabled,
    deploymentLimits: deployment,
    runtimeState: runtime,
  };
}

/**
 * Update runtime feature state from owner dashboard.
 * Enforces rule: Cannot enable a feature if deployment explicitly disallows it.
 */
export async function updateRuntimeFeatureStateAsync(
  updates: Partial<SystemFeatureState>
): Promise<{
  success: boolean;
  effectiveState?: {
    adultClub: boolean;
    mediaCreation: boolean;
    registration: boolean;
  };
  error?: string;
  unavailable?: boolean;
}> {
  const deployment = getDeploymentFeatureLimits();
  const current = await getRuntimeFeatureStateAsync();

  const nextState: SystemFeatureState = {
    adultClubEnabled: updates.adultClubEnabled !== undefined ? updates.adultClubEnabled : current.adultClubEnabled,
    mediaCreationEnabled: updates.mediaCreationEnabled !== undefined ? updates.mediaCreationEnabled : current.mediaCreationEnabled,
    registrationEnabled: updates.registrationEnabled !== undefined ? updates.registrationEnabled : current.registrationEnabled,
  };

  // If attempting to enable adult club when deployment explicitly forbids it, reject or clamp
  if (nextState.adultClubEnabled && !deployment.adultClubAllowed) {
    return {
      success: false,
      error: 'Cannot enable Adult Club at runtime: deployment configuration (ADULT_CLUB_ENABLED=false) strictly forbids it.',
    };
  }

  // If attempting to enable media when deployment forbids it
  if (nextState.mediaCreationEnabled && !deployment.mediaAllowed) {
    return {
      success: false,
      error: 'Cannot enable media creation at runtime: private media infrastructure (#4B) is not yet available.',
    };
  }

  if (distributedStore.isConfigured()) {
    try {
      const ok = await distributedStore.set(FEATURE_KEY, JSON.stringify(nextState));
      if (!ok) {
        return { success: false, unavailable: true, error: 'Authoritative feature state could not be persisted.' };
      }
    } catch {
      return { success: false, unavailable: true, error: 'Authoritative feature state is unavailable.' };
    }
  }

  memoryFeatureState = { ...nextState };

  const effective = await getEffectiveFeatureStateAsync();
  return {
    success: true,
    effectiveState: {
      adultClub: effective.adultClub,
      mediaCreation: effective.mediaCreation,
      registration: effective.registration,
    },
  };
}

export function resetFeatureStoreForTests(): void {
  memoryFeatureState = { ...DEFAULT_FEATURE_STATE };
}
