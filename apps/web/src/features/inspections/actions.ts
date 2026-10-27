'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { inspectionInput } from '@/lib/operation-input';

export type InspectionActionResult = { ok: boolean; error?: string };

function cleanMessage(message: string) {
  return message.replace(/^\w+:\s*/, '').trim() || 'The inspection could not be completed.';
}

export async function submitInspectionAction(value: unknown): Promise<InspectionActionResult> {
  const parsed = inspectionInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Check the inspection outcome, confirm personal verification, and keep findings to 250 characters.' };
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_inspection', {
    p_requirement_id: input.requirementId,
    p_outcome: input.outcome,
    p_findings: input.findings.trim(),
    p_personally_verified: input.personallyVerified,
    p_expected_version: input.expectedVersion,
  });

  if (error) {
    // Refresh the shared queue so a stale submission shows the latest result on reopen.
    revalidatePath('/inspections');
    revalidatePath('/(operations)', 'layout');
    return { ok: false, error: cleanMessage(error.message) };
  }

  revalidatePath('/inspections');
  revalidatePath('/(operations)', 'layout');
  revalidatePath('/overview');
  revalidatePath('/rooms');
  revalidatePath('/stays');
  revalidatePath('/departure-due');
  return { ok: true };
}
