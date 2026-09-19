import { NextResponse } from 'next/server';
import { getAllOnboardedProfiles } from '@/lib/data/profileStore';

export async function GET() {
  try {
    const profiles = getAllOnboardedProfiles();
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
