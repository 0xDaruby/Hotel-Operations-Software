import { requireStaffProfile } from "@/features/auth/staff-profile";
import { getStaffMembers } from "@/features/staff/staff-management";
import { StaffWorkspace } from "@/features/staff/staff-workspace";
export default async function StaffManagementPage() {
  await requireStaffProfile(["owner"]);
  const { staff, managementAvailable } = await getStaffMembers();
  return (
    <section className="staff-page" aria-labelledby="workspace-page-heading">
      <StaffWorkspace staff={staff} managementAvailable={managementAvailable} />
    </section>
  );
}
