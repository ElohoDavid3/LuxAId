import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export interface AuditEntry {
  businessId: string;
  eventType: string;
  actorId?: string;
  actorType?: string;
  payload?: unknown;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      businessId: entry.businessId,
      eventType: entry.eventType,
      actorId: entry.actorId,
      actorType: entry.actorType,
      payload: entry.payload as object | undefined,
    },
  });
}

/**
 * Audit that must never break the operation it accompanies. Used on
 * authorization-denied paths where the target business may not exist
 * (AuditLog is tenant-owned, so the FK would otherwise fail).
 */
export async function safeAudit(entry: AuditEntry): Promise<void> {
  try {
    await logAudit(entry);
  } catch (error) {
    logger.warn('audit.failed', {
      eventType: entry.eventType,
      businessId: entry.businessId,
    });
  }
}
