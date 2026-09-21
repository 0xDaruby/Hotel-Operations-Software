'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { MaintenanceIssueType } from './maintenance';

export type MaintenanceActionResult = { ok: boolean; error?: string };

function cleanMessage(message: string) {
  return message.replace(/^\w+:\s*/, '').trim() || 'The maintenance update could not be completed.';
}

function revalidateMaintenanceViews() {
  revalidatePath('/maintenance');
  revalidatePath('/rooms');
  revalidatePath('/stays');
  revalidatePath('/departure-due');
}

export async function reportMaintenanceIssueAction(input: {
  roomId: string;
  issueType: MaintenanceIssueType;
  detail: string;
}): Promise<MaintenanceActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('report_maintenance_issue', {
    p_room_id: input.roomId,
    p_issue_type: input.issueType,
    p_detail: input.detail.trim(),
  });

  if (error) return { ok: false, error: cleanMessage(error.message) };
  revalidateMaintenanceViews();
  return { ok: true };
}

export async function resolveMaintenanceIssueAction(input: {
  issueId: string;
  resolutionDetail: string;
  expectedVersion: number;
}): Promise<MaintenanceActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_maintenance_issue', {
    p_issue_id: input.issueId,
    p_resolution_detail: input.resolutionDetail.trim(),
    p_expected_version: input.expectedVersion,
  });

  if (error) {
    // Refresh so a stale or already-resolved issue shows its latest state on reopen.
    revalidatePath('/maintenance');
    return { ok: false, error: cleanMessage(error.message) };
  }
  revalidateMaintenanceViews();
  return { ok: true };
}