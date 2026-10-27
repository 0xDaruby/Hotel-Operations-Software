import { z } from 'zod';

// PostgreSQL UUID columns also accept canonical legacy/nil-version identifiers.
const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const version = z.number().int().min(1).max(2147483647);
const days = z.number().int().min(1).max(30);
const amount = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
// These generous application limits bound operational text before any RPC call.
// The database independently enforces authorization, tenancy and business rules.
const guestName = z.string().trim().min(1).max(200);
const guestPhone = z.string().trim().max(50);
const reason = z.string().trim().min(1).max(1000);
const note = z.string().trim().max(250);

export const arrivalInput = z.object({ roomId: id, guestName, guestPhone, paidDays: days, expectedAmount: amount });
export const extensionInput = z.object({ stayId: id, addedDays: days, expectedAmount: amount, expectedVersion: version });
export const departureInput = z.object({ stayId: id, expectedVersion: version });
export const moveInput = z.object({ stayId: id, toRoomId: id, reason, expectedVersion: version });
export const correctionInput = z.object({ stayId: id, guestName, guestPhone, paidDays: days, reason, expectedVersion: version });
export const voidInput = z.object({ stayId: id, reason, expectedVersion: version });
export const inspectionInput = z.object({
  requirementId: id,
  outcome: z.enum(['approved', 'attention', 'access_blocked']),
  findings: note,
  personallyVerified: z.literal(true),
  expectedVersion: version,
}).refine(input => input.outcome === 'approved' || Boolean(input.findings));
export const maintenanceReportInput = z.object({
  roomId: id, issueType: z.enum(['air_conditioning', 'furniture', 'plumbing', 'electrical', 'other']), detail: note,
}).refine(input => input.issueType !== 'other' || Boolean(input.detail));
export const maintenanceResolutionInput = z.object({ issueId: id, resolutionDetail: note.min(1), expectedVersion: version });
