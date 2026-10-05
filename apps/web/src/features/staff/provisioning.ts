export type StaffInput = {
  displayName: string;
  email: string;
  role: "receptionist" | "supervisor";
};
export function validateStaffInput(value: unknown): StaffInput {
  if (!value || typeof value !== "object")
    throw new Error("Enter staff details.");
  const row = value as Record<string, unknown>;
  if (
    typeof row.displayName !== "string" ||
    !row.displayName.trim() ||
    row.displayName.trim().length > 100
  )
    throw new Error("Enter a name of 1–100 characters.");
  if (
    typeof row.email !== "string" ||
    row.email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())
  )
    throw new Error("Enter a valid email address.");
  if (row.role !== "receptionist" && row.role !== "supervisor")
    throw new Error("Choose receptionist or supervisor.");
  return {
    displayName: row.displayName.trim(),
    email: row.email.trim().toLowerCase(),
    role: row.role,
  };
}
export type ProvisionDependencies = {
  createUser(input: StaffInput): Promise<string>;
  createProfile(userId: string, input: StaffInput): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  sendSetup(email: string): Promise<void>;
};
export type StaffActionResult = {
  ok: boolean;
  error?: string;
  emailSent?: boolean;
  message?: string;
};
export async function provisionStaff(
  value: unknown,
  deps: ProvisionDependencies,
): Promise<StaffActionResult> {
  let input: StaffInput;
  try {
    input = validateStaffInput(value);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid details.",
    };
  }
  let userId: string;
  try {
    userId = await deps.createUser(input);
  } catch {
    return {
      ok: false,
      error:
        "Unable to create this account. The email may already be registered. Existing accounts are never reassigned.",
    };
  }
  try {
    await deps.createProfile(userId, input);
  } catch {
    try {
      await deps.deleteUser(userId);
    } catch {
      return {
        ok: false,
        error:
          "Profile creation failed and account cleanup also failed. Contact the system administrator before retrying.",
      };
    }
    return {
      ok: false,
      error: "Staff profile could not be created. The new account was removed.",
    };
  }
  try {
    await deps.sendSetup(input.email);
    return {
      ok: true,
      emailSent: true,
      message:
        "Setup email requested. Access remains inactive until password setup is complete.",
    };
  } catch {
    return {
      ok: true,
      emailSent: false,
      message:
        "Account created with inactive access. Setup email could not be sent; use Retry setup email.",
    };
  }
}
