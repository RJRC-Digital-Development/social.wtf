import crypto from 'crypto';
import { distributedStore } from '../security/distributedStore.ts';
import { sanitizePlainText } from '../security/sanitize.ts';

export const PLATFORM_PUBLICATION_CATEGORIES = [
  'COMING_SOON', 'IN_DEVELOPMENT', 'RECENTLY_INSTALLED', 'PLATFORM_UPDATE',
  'FUTURE_PLAN', 'PLANNED_FEATURE', 'FEATURE_REQUEST_UPDATE',
] as const;
export type PlatformPublicationCategory = typeof PLATFORM_PUBLICATION_CATEGORIES[number];
export type PlatformPublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface PlatformPublication {
  publicationId: string;
  publisherType: 'PLATFORM_OFFICIAL';
  actorAccountId: string;
  category: PlatformPublicationCategory;
  title: string;
  body: string;
  status: PlatformPublicationStatus;
  pinned: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

export type PublicPlatformPublication = Omit<PlatformPublication, 'actorAccountId' | 'status' | 'createdAt'> & {
  publisher: 'Social.wtf Official';
};

const PUBLICATION_PREFIX = 'platform:publication:';
const PUBLICATION_IDS = 'platform:publications:all';
const memoryPublications = new Map<string, PlatformPublication>();

function validateText(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error(`${name.toUpperCase()}_REQUIRED`);
  const sanitized = sanitizePlainText(value, max);
  if (sanitized.length < min) throw new Error(`${name.toUpperCase()}_INVALID`);
  if (value.length > max) throw new Error(`${name.toUpperCase()}_TOO_LONG`);
  return sanitized;
}

function validateCategory(value: unknown): PlatformPublicationCategory {
  if (!PLATFORM_PUBLICATION_CATEGORIES.includes(value as PlatformPublicationCategory)) {
    throw new Error('CATEGORY_INVALID');
  }
  return value as PlatformPublicationCategory;
}

function validatePriority(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new Error('PRIORITY_INVALID');
  }
  return value as number;
}

async function persist(record: PlatformPublication, isNew = false): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    throw new Error('PERSISTENCE_UNAVAILABLE');
  }
  if (distributedStore.isConfigured()) {
    const saved = await distributedStore.set(`${PUBLICATION_PREFIX}${record.publicationId}`, JSON.stringify(record));
    if (!saved) throw new Error('PERSISTENCE_UNAVAILABLE');
    if (isNew) {
      const indexed = await distributedStore.sadd(PUBLICATION_IDS, record.publicationId);
      if (!indexed) {
        await distributedStore.del(`${PUBLICATION_PREFIX}${record.publicationId}`);
        throw new Error('PERSISTENCE_UNAVAILABLE');
      }
    }
  }
  memoryPublications.set(record.publicationId, record);
}

export async function createPlatformPublicationAsync(actorAccountId: string, input: Record<string, unknown>): Promise<PlatformPublication> {
  const now = Date.now();
  const record: PlatformPublication = {
    publicationId: `pub_${crypto.randomBytes(16).toString('hex')}`,
    publisherType: 'PLATFORM_OFFICIAL',
    actorAccountId,
    category: validateCategory(input.category),
    title: validateText(input.title, 'title', 3, 120),
    body: validateText(input.body, 'body', 1, 5000),
    status: 'DRAFT',
    pinned: input.pinned === true,
    priority: validatePriority(input.priority ?? 0),
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };
  await persist(record, true);
  return record;
}

export async function getPlatformPublicationAsync(id: string): Promise<PlatformPublication | null> {
  if (!/^pub_[a-f0-9]{32}$/.test(id)) return null;
  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    throw new Error('PERSISTENCE_UNAVAILABLE');
  }
  if (distributedStore.isConfigured()) {
    const result = await distributedStore.getWithStatus(`${PUBLICATION_PREFIX}${id}`);
    if (!result.ok) throw new Error('PERSISTENCE_UNAVAILABLE');
    if (!result.value) return null;
    const record = JSON.parse(result.value) as PlatformPublication;
    memoryPublications.set(id, record);
    return record;
  }
  return memoryPublications.get(id) || null;
}

export async function listPlatformPublicationsAsync(limit = 50): Promise<PlatformPublication[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  let records: PlatformPublication[];
  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    throw new Error('PERSISTENCE_UNAVAILABLE');
  }
  if (distributedStore.isConfigured()) {
    const index = await distributedStore.smembersWithStatus(PUBLICATION_IDS);
    if (!index.ok) throw new Error('PERSISTENCE_UNAVAILABLE');
    records = (await Promise.all(index.values.slice(0, 200).map(getPlatformPublicationAsync))).filter(Boolean) as PlatformPublication[];
  } else {
    records = Array.from(memoryPublications.values());
  }
  return records.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.priority - a.priority || b.updatedAt - a.updatedAt).slice(0, safeLimit);
}

export async function updatePlatformPublicationAsync(
  publicationId: string,
  actorAccountId: string,
  input: Record<string, unknown>,
  action: 'UPDATE' | 'PUBLISH' | 'ARCHIVE'
): Promise<PlatformPublication> {
  const existing = await getPlatformPublicationAsync(publicationId);
  if (!existing) throw new Error('PUBLICATION_NOT_FOUND');
  const now = Date.now();
  const record = { ...existing, actorAccountId, updatedAt: now };
  if (action === 'UPDATE') {
    if (existing.status === 'ARCHIVED') throw new Error('ARCHIVED_PUBLICATION_IMMUTABLE');
    if (input.category !== undefined) record.category = validateCategory(input.category);
    if (input.title !== undefined) record.title = validateText(input.title, 'title', 3, 120);
    if (input.body !== undefined) record.body = validateText(input.body, 'body', 1, 5000);
    if (input.pinned !== undefined) {
      if (typeof input.pinned !== 'boolean') throw new Error('PINNED_INVALID');
      record.pinned = input.pinned;
    }
    if (input.priority !== undefined) record.priority = validatePriority(input.priority);
  } else if (action === 'PUBLISH') {
    if (existing.status === 'ARCHIVED') throw new Error('ARCHIVED_PUBLICATION_IMMUTABLE');
    record.status = 'PUBLISHED';
    record.publishedAt = existing.publishedAt || now;
  } else {
    record.status = 'ARCHIVED';
    record.pinned = false;
  }
  await persist(record);
  return record;
}

export function serializePublicPublication(record: PlatformPublication): PublicPlatformPublication {
  return {
    publicationId: record.publicationId,
    publisher: 'Social.wtf Official',
    publisherType: 'PLATFORM_OFFICIAL',
    category: record.category,
    title: record.title,
    body: record.body,
    pinned: record.pinned,
    priority: record.priority,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
  };
}

export function resetPlatformContentStoreForTests(): void { memoryPublications.clear(); }
