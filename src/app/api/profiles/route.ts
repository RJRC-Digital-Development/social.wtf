import { NextResponse } from 'next/server';
import { getAllOnboardedProfilesAsync } from '@/lib/data/profileStore';

export async function GET() {
  try {
    const profiles = await getAllOnboardedProfilesAsync();
    return NextResponse.json({
      success: true,
      count: profiles.length,
      profiles,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error fetching member directory' },
      { status: 500 }
    );
  }
}
