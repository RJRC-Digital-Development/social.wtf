import { distributedStore } from '../security/distributedStore.ts';
import type { SystemFeatureState } from '../../types/account.ts';

const FEATURE_KEY = 'platform:system:features';

let memoryFeatureState: SystemFeatureState = {
  adultClubEnabled: false,
  mediaCreationEnabled: false,
  registrationEnabled: true,
};

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
    try {
      const raw = await distributedStore.get(FEATURE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SystemFeatureState>;
        return {
          adultClubEnabled: parsed.adultClubEnabled ?? false,
          mediaCreationEnabled: parsed.mediaCreationEnabled ?? false,
          registrationEnabled: parsed.registrationEnabled ?? true,
        };
      }
    } catch {
      // Fallback to memory state
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
        return { success: false, error: 'Failed to persist feature state to distributed store.' };
      }
    } catch {
      return { success: false, error: 'Distributed store failure during feature update.' };
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
  memoryFeatureState = {
    adultClubEnabled: false,
    mediaCreationEnabled: false,
    registrationEnabled: true,
  };
}
