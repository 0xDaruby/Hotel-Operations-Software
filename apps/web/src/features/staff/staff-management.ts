import { createClient } from "@/lib/supabase/server";

export type StaffMember = {
  userId: string;
  displayName: string;
  email: string | null;
  role: "owner" | "receptionist" | "supervisor";
  active: boolean;
  hotelId: string;
  setupPending: boolean;
  mustChangePassword: boolean;
  setupCancelled: boolean;
};

export async function getStaffMembers(): Promise<{ staff: StaffMember[]; managementAvailable: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_staff");
  if (error?.code === 'PGRST202') {
    // Only a missing RPC activates the compatibility view. Permission/network
    // failures remain errors rather than being hidden by a fallback.
    const existing = await supabase.from('staff_profiles')
      .select('user_id, hotel_id, display_name, role, active, must_change_password')
      .order('display_name');
    if (existing.error) throw new Error(`Unable to load staff members: ${existing.error.message}`);
    return { staff: mapStaff(existing.data ?? []), managementAvailable: false };
  }
  if (error) throw new Error(`Unable to load staff members: ${error.message}`);
  return { staff: mapStaff((data ?? []) as Record<string, unknown>[]), managementAvailable: true };
}

function mapStaff(rows: Record<string, unknown>[]): StaffMember[] {
  return rows.map((row) => ({
    userId: String(row.user_id ?? ""),
    displayName: String(row.display_name ?? "Unnamed staff"),
    email: typeof row.email === "string" ? row.email : null,
    role: (row.role as StaffMember["role"]) ?? "receptionist",
    active: Boolean(row.active),
    setupPending: Boolean(row.setup_pending),
    mustChangePassword: Boolean(row.must_change_password),
    setupCancelled: Boolean(row.setup_cancelled),
    hotelId: String(row.hotel_id ?? ""),
  }));
}

export async function getCurrentHotelId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("hotel_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError)
    throw new Error(`Unable to load hotel context: ${profileError.message}`);
  return profile?.hotel_id ?? null;
}
