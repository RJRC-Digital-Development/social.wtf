import { NextResponse } from 'next/server';
import { requestStepUpChallengeAsync } from '@/lib/security/stepUpChallenge';

export async function POST(req: Request) {
  try {
    const result = await requestStepUpChallengeAsync(req);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[Owner Step-Up Challenge Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
