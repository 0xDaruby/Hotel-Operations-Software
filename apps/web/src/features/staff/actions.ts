"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaffProfile } from "@/features/auth/staff-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, staffSetupRedirect } from "@/lib/supabase/admin";
import { provisionStaff, type StaffActionResult } from "./provisioning";
import { deleteStaffAccount } from './account-lifecycle';
import { sendSetupEmail } from '@/lib/supabase/staff-setup-email';
export async function createStaffAction(
  input: unknown,
): Promise<StaffActionResult> {
  const actor = await requireStaffProfile(["owner"]);
  try {
    const admin = createAdminClient();
    const redirectTo = staffSetupRedirect();
    const supabase = await createClient();
    const result = await provisionStaff(input, {
      createUser: async (details) => {
        const { data, error } = await admin.auth.admin.createUser({
          email: details.email,
          password: randomBytes(48).toString("base64url"),
          email_confirm: false,
          app_metadata: { provisioned_by: actor.userId },
        });
        if (error || !data.user) throw Error("Unable to provision");
        return data.user.id;
      },
      createProfile: async (userId, details) => {
        const { error } = await supabase.rpc("provision_staff_profile", {
          p_user_id: userId,
          p_display_name: details.displayName,
          p_role: details.role,
        });
        if (error) throw Error(error.message);
      },
      deleteUser: async (userId) => {
        const { data: profile, error: lookupError } = await admin
          .from("staff_profiles")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (lookupError || profile)
          throw Error("Profile persistence is uncertain; account retained.");
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw Error(error.message);
      },
      sendSetup: (email, userId) => sendSetupEmail(admin, userId, email, redirectTo),
    });
    revalidatePath("/staff");
    revalidatePath("/overview");
    return result;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Staff management is unavailable.",
    };
  }
}
export async function retryStaffSetupAction(
  userId: string,
): Promise<StaffActionResult> {
  await requireStaffProfile(["owner"]);
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId))
    return { ok: false, error: "Invalid staff account." };
  try {
    const redirectTo = staffSetupRedirect();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_pending_staff_email", {
      p_user_id: userId,
    });
    if (error || typeof data !== "string")
      return { ok: false, error: "No pending account is available." };
    await sendSetupEmail(createAdminClient(), userId, data, redirectTo);
    return {
      ok: true,
      message: "Setup email requested. Ask staff to check their inbox.",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to request setup email.",
    };
  }
}
export async function setStaffActiveAction(input: {
  userId: string;
  expectedActive: boolean;
  active: boolean;
  reason: string;
}): Promise<StaffActionResult> {
  await requireStaffProfile(["owner"]);
  if (
    !input ||
    typeof input.userId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(input.userId) ||
    typeof input.expectedActive !== "boolean" ||
    typeof input.active !== "boolean" ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.trim().length > 500
  )
    return { ok: false, error: "Provide a valid staff account and reason." };
  const supabase = await createClient();
  const lifecycle = await supabase.rpc('get_staff_access_status');
  if (lifecycle.error || lifecycle.data !== 'ready') return { ok: false, error: 'Staff access controls are unavailable. Refresh or contact the administrator.' };
  const { error } = await supabase.rpc("set_staff_active", {
    p_user_id: input.userId,
    p_expected_active: input.expectedActive,
    p_active: input.active,
    p_reason: input.reason.trim(),
  });
  revalidatePath("/staff");
  revalidatePath("/overview");
  return error
    ? { ok: false, error: error.message }
    : {
        ok: true,
        message: input.active
          ? "Staff access activated."
          : "Staff access deactivated and sessions revoked.",
      };
}

export async function deleteStaffAccountAction(input: unknown): Promise<StaffActionResult> {
  await requireStaffProfile(['owner']);
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const result = await deleteStaffAccount(input, {
      prepare: async details => {
        const { data, error } = await supabase.rpc('prepare_staff_deletion', {
          p_user_id: details.userId, p_reason: details.reason, p_confirmation: details.confirmation,
        });
        if (error || typeof data !== 'string') throw Error('Deletion was not authorized.');
        return data;
      },
      authUserExists: async userId => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error?.status === 404 || error?.code === 'user_not_found') return false;
        if (error || !data.user) throw Error('Unable to confirm Auth account.');
        return true;
      },
      deleteAuthUser: async userId => {
        const { error } = await admin.auth.admin.deleteUser(userId, false);
        if (error) throw Error('Auth deletion failed.');
      },
      complete: async (requestId, userId) => {
        const { error } = await admin.rpc('complete_staff_deletion', { p_user_id: userId, p_request_id: requestId });
        if (error) throw Error('Deletion confirmation failed.');
      },
    });
    revalidatePath('/staff');
    revalidatePath('/overview');
    return result;
  } catch {
    return { ok: false, error: 'Staff account deletion is unavailable. The account has not been reactivated.' };
  }
}

export async function cancelStaffSetupAction(input: {
  userId: string;
  reason: string;
}): Promise<StaffActionResult> {
  await requireStaffProfile(["owner"]);
  if (
    !input ||
    typeof input.userId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(input.userId) ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.trim().length > 500
  )
    return { ok: false, error: "Provide a valid staff account and reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_staff_setup", {
    p_user_id: input.userId,
    p_reason: input.reason.trim(),
  });
  revalidatePath("/staff");
  revalidatePath("/overview");
  return error
    ? { ok: false, error: error.message }
    : { ok: true, message: "Setup cancelled. Staff access remains inactive." };
}
