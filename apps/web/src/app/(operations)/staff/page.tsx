import { requireStaffProfile } from "@/features/auth/staff-profile";
import { getStaffMembers } from "@/features/staff/staff-management";
import { StaffWorkspace } from "@/features/staff/staff-workspace";
import { UserListIcon } from "@/components/icons";
export default async function StaffManagementPage() {
  await requireStaffProfile(["owner"]);
  const { staff, managementAvailable } = await getStaffMembers();
  return (
    <section className="staff-page" aria-labelledby="staff-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Owner access</p>
          <h2 id="staff-heading">
            <UserListIcon className="icon icon-lg" aria-hidden="true" />
            Hotel staff
          </h2>
        </div>
      </div>
      <StaffWorkspace staff={staff} managementAvailable={managementAvailable} />
    </section>
  );
}
