import { validateRequestSessionAsync } from './session.ts';
import { accountHasCapabilityAsync, issueStepUpChallengeAsync } from './rbac.ts';

const STEP_UP_ELIGIBILITY_CAPABILITY = 'emergency:freeze';

export type StepUpChallengeRequestResult =
  | { status: 401; body: { error: 'UNAUTHORIZED'; message: string } }
  | { status: 403; body: { error: 'FORBIDDEN'; message: string } }
  | {
      status: 200;
      body: { success: true; challengeNonce: string; expiresAt: number };
    };

export async function requestStepUpChallengeAsync(
  req: Request
): Promise<StepUpChallengeRequestResult> {
  const sessionResult = await validateRequestSessionAsync(req);
  if (!sessionResult.authenticated) {
    return {
      status: 401,
      body: { error: 'UNAUTHORIZED', message: 'Authentication required' },
    };
  }

  const { accountId, sessionId } = sessionResult.payload;
  const isPrivileged = await accountHasCapabilityAsync(accountId, STEP_UP_ELIGIBILITY_CAPABILITY);
  if (!isPrivileged) {
    return {
      status: 403,
      body: { error: 'FORBIDDEN', message: 'Account lacks privileged step-up capability' },
    };
  }

  const challenge = await issueStepUpChallengeAsync(accountId, sessionId);
  return {
    status: 200,
    body: {
      success: true,
      challengeNonce: challenge.challengeNonce,
      expiresAt: challenge.expiresAt,
    },
  };
}
