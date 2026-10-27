'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { arrivalInput, extensionInput, departureInput, moveInput, correctionInput, voidInput } from '@/lib/operation-input';

export type ActionResult = { ok: boolean; error?: string };

function cleanMessage(message: string) {
  return message.replace(/^\w+:\s*/, '').trim() || 'The operation could not be completed.';
}

async function runRpc(fn: string, params: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, params);
  if (error) return { ok: false, error: cleanMessage(error.message) };
  revalidatePath('/overview');
  revalidatePath('/stays');
  revalidatePath('/departure-due');
  revalidatePath('/rooms');
  revalidatePath('/payments');
  return { ok: true };
}

export async function recordArrivalAction(value: unknown): Promise<ActionResult> {
  const parsed = arrivalInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Check the room, guest details, paid days and amount.' };
  const input = parsed.data;
  return runRpc('record_arrival', {
    p_room_id: input.roomId,
    p_guest_name: input.guestName.trim(),
    p_guest_phone: input.guestPhone.trim() || null,
    p_paid_days: input.paidDays,
    p_expected_amount: input.expectedAmount,
  });
}

export async function extendStayAction(value: unknown): Promise<ActionResult> {
  const parsed = extensionInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Check the stay, added days and amount, then retry.' };
  const input = parsed.data;
  return runRpc('extend_stay', {
    p_stay_id: input.stayId,
    p_added_days: input.addedDays,
    p_expected_amount: input.expectedAmount,
    p_expected_version: input.expectedVersion,
  });
}

export async function confirmDepartureAction(value: unknown): Promise<ActionResult> {
  const parsed = departureInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Select a valid stay and refresh before confirming departure.' };
  const input = parsed.data;
  return runRpc('confirm_departure', {
    p_stay_id: input.stayId,
    p_expected_version: input.expectedVersion,
  });
}

export async function moveStayAction(value: unknown): Promise<ActionResult> {
  const parsed = moveInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Select a valid stay and destination, and provide a reason of up to 1,000 characters.' };
  const input = parsed.data;
  return runRpc('move_stay', {
    p_stay_id: input.stayId,
    p_to_room_id: input.toRoomId,
    p_reason: input.reason.trim(),
    p_expected_version: input.expectedVersion,
  });
}

export async function correctStayAction(value: unknown): Promise<ActionResult> {
  const parsed = correctionInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Check the stay, guest details, paid days and correction reason.' };
  const input = parsed.data;
  return runRpc('correct_stay', {
    p_stay_id: input.stayId,
    p_guest_name: input.guestName.trim(),
    p_guest_phone: input.guestPhone.trim() || null,
    p_paid_days: input.paidDays,
    p_reason: input.reason.trim(),
    p_expected_version: input.expectedVersion,
  });
}

export async function voidStayAction(value: unknown): Promise<ActionResult> {
  const parsed = voidInput.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'Select a valid stay and provide a reason of up to 1,000 characters.' };
  const input = parsed.data;
  return runRpc('void_stay', {
    p_stay_id: input.stayId,
    p_reason: input.reason.trim(),
    p_expected_version: input.expectedVersion,
  });
}
