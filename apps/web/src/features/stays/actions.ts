'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

export async function recordArrivalAction(input: {
  roomId: string;
  guestName: string;
  guestPhone: string;
  paidDays: number;
  expectedAmount: number;
}): Promise<ActionResult> {
  return runRpc('record_arrival', {
    p_room_id: input.roomId,
    p_guest_name: input.guestName.trim(),
    p_guest_phone: input.guestPhone.trim() || null,
    p_paid_days: input.paidDays,
    p_expected_amount: input.expectedAmount,
  });
}

export async function extendStayAction(input: {
  stayId: string;
  addedDays: number;
  expectedAmount: number;
  expectedVersion: number;
}): Promise<ActionResult> {
  return runRpc('extend_stay', {
    p_stay_id: input.stayId,
    p_added_days: input.addedDays,
    p_expected_amount: input.expectedAmount,
    p_expected_version: input.expectedVersion,
  });
}

export async function confirmDepartureAction(input: {
  stayId: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  return runRpc('confirm_departure', {
    p_stay_id: input.stayId,
    p_expected_version: input.expectedVersion,
  });
}

export async function moveStayAction(input: {
  stayId: string;
  toRoomId: string;
  reason: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  return runRpc('move_stay', {
    p_stay_id: input.stayId,
    p_to_room_id: input.toRoomId,
    p_reason: input.reason.trim(),
    p_expected_version: input.expectedVersion,
  });
}

export async function correctStayAction(input: {
  stayId: string;
  guestName: string;
  guestPhone: string;
  paidDays: number;
  reason: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  return runRpc('correct_stay', {
    p_stay_id: input.stayId,
    p_guest_name: input.guestName.trim(),
    p_guest_phone: input.guestPhone.trim() || null,
    p_paid_days: input.paidDays,
    p_reason: input.reason.trim(),
    p_expected_version: input.expectedVersion,
  });
}

export async function voidStayAction(input: {
  stayId: string;
  reason: string;
  expectedVersion: number;
}): Promise<ActionResult> {
  return runRpc('void_stay', {
    p_stay_id: input.stayId,
    p_reason: input.reason.trim(),
    p_expected_version: input.expectedVersion,
  });
}
