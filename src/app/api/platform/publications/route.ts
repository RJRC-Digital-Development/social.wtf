import { NextResponse } from 'next/server.js';
import { PLATFORM_PUBLICATION_CATEGORIES, listPlatformPublicationsAsync, serializePublicPublication } from '../../../../lib/data/platformContentStore.ts';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    if (category && !PLATFORM_PUBLICATION_CATEGORIES.includes(category as any)) {
      return NextResponse.json({ error: 'CATEGORY_INVALID' }, { status: 400 });
    }
    const requestedLimit = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
    const records = await listPlatformPublicationsAsync(100);
    const publications = records
      .filter((record) => record.status === 'PUBLISHED' && (!category || record.category === category))
      .slice(0, limit)
      .map(serializePublicPublication);
    return NextResponse.json({ success: true, publications });
  } catch {
    return NextResponse.json({ error: 'PERSISTENCE_UNAVAILABLE' }, { status: 503 });
  }
}
