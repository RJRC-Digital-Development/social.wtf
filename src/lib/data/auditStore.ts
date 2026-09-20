import crypto from 'crypto';
import { distributedStore } from '../security/distributedStore.ts';
import type { AuditLogRecord } from '../../types/account.ts';

const AUDIT_LIST_KEY = 'platform:audit:log';
const AUDIT_PREFIX = 'platform:audit:entry:';
const OP_PREFIX = 'platform:audit:op:';

export type OperationState =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'APPLIED'
  | 'AUDITED'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export interface PrivilegedOperationRecord {
  opId: string;
  idempotencyKey?: string;
  actorAccountId: string;
  targetType: string;
  targetId: string;
  action: string;
  state: OperationState;
  createdAt: number;
  updatedAt: number;
  auditId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// In-memory fallback
const memoryAuditLogs: AuditLogRecord[] = [];
const memoryOps = new Map<string, PrivilegedOperationRecord>();

export async function createPrivilegedOperationAsync(
  actorAccountId: string,
  targetType: string,
  targetId: string,
  action: string,
  idempotencyKey?: string,
  metadata?: Record<string, unknown>
): Promise<PrivilegedOperationRecord> {
  const opId = `op_${crypto.randomBytes(16).toString('hex')}`;
  const now = Date.now();

  const record: PrivilegedOperationRecord = {
    opId,
    idempotencyKey,
    actorAccountId,
    targetType,
    targetId,
    action,
    state: 'PENDING',
    createdAt: now,
    updatedAt: now,
    metadata,
  };

  if (distributedStore.isConfigured()) {
    try {
      await distributedStore.set(`${OP_PREFIX}${opId}`, JSON.stringify(record), 86400);
    } catch {
      // Memory fallback
    }
  }

  memoryOps.set(opId, record);
  return record;
}

export async function updateOperationStateAsync(
  opId: string,
  state: OperationState,
  auditId?: string,
  error?: string
): Promise<PrivilegedOperationRecord | null> {
  const now = Date.now();
  let current: PrivilegedOperationRecord | null = memoryOps.get(opId) || null;

  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${OP_PREFIX}${opId}`);
      if (raw) {
        current = JSON.parse(raw);
      }
    } catch {}
  }

  if (!current) return null;

  current.state = state;
  current.updatedAt = now;
  if (auditId) current.auditId = auditId;
  if (error) current.error = error;

  if (distributedStore.isConfigured()) {
    try {
      await distributedStore.set(`${OP_PREFIX}${opId}`, JSON.stringify(current), 86400);
    } catch {}
  }

  memoryOps.set(opId, current);
  return current;
}

export async function recordAuditLogAsync(
  entry: Omit<AuditLogRecord, 'auditId' | 'timestamp'>
): Promise<AuditLogRecord> {
  const auditId = `aud_${crypto.randomBytes(16).toString('hex')}`;
  const record: AuditLogRecord = {
    auditId,
    timestamp: Date.now(),
    ...entry,
  };

  // Ensure metadata has zero sensitive keys
  if (record.metadata) {
    const cleanedMeta: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(record.metadata)) {
      const lower = k.toLowerCase();
      if (
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('privatekey') ||
        lower.includes('hash') ||
        lower.includes('token')
      ) {
        continue;
      }
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        cleanedMeta[k] = v;
      }
    }
    record.metadata = cleanedMeta;
  }

  if (distributedStore.isConfigured()) {
    try {
      await distributedStore.set(`${AUDIT_PREFIX}${auditId}`, JSON.stringify(record));
      // Store in reverse-chronological list or set
      await distributedStore.sadd(AUDIT_LIST_KEY, auditId);
    } catch (err) {
      console.error('[AuditStore] Failed to write audit record to distributed store:', err);
    }
  }

  memoryAuditLogs.unshift(record);
  if (memoryAuditLogs.length > 500) {
    memoryAuditLogs.pop();
  }

  return record;
}

export async function getAuditLogsAsync(limit = 50, offset = 0): Promise<AuditLogRecord[]> {
  if (distributedStore.isConfigured()) {
    try {
      const auditIds = await distributedStore.smembers(AUDIT_LIST_KEY);
      const records: AuditLogRecord[] = [];
      for (const id of auditIds.slice(0, 100)) {
        const raw = await distributedStore.get(`${AUDIT_PREFIX}${id}`);
        if (raw) {
          try {
            records.push(JSON.parse(raw));
          } catch {}
        }
      }
      records.sort((a, b) => b.timestamp - a.timestamp);
      return records.slice(offset, offset + limit);
    } catch {
      return memoryAuditLogs.slice(offset, offset + limit);
    }
  }

  return memoryAuditLogs.slice(offset, offset + limit);
}

export function resetAuditStoreForTests(): void {
  memoryAuditLogs.length = 0;
  memoryOps.clear();
}
