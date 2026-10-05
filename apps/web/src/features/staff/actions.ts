"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaffProfile } from "@/features/auth/staff-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, staffSetupRedirect } from "@/lib/supabase/admin";
import { provisionStaff, type StaffActionResult } from "./provisioning";
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
          email_confirm: true,
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
      sendSetup: async (email) => {
        const { error } = await admin.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (error) throw Error(error.message);
      },
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
    const { error: sendError } =
      await createAdminClient().auth.resetPasswordForEmail(data, {
        redirectTo,
      });
    if (sendError)
      return {
        ok: false,
        error: "Setup email could not be requested. Retry later.",
      };
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
          : "Staff access deactivated.",
      };
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
