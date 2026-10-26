"use client";
import { useSuccessBanner } from '@/components/success-banner';
import { useRef, useState, useTransition } from "react";
import { TaskSheet } from '@/components/task-sheet';
import type { StaffMember } from "./staff-management";
import {
  createStaffAction,
  retryStaffSetupAction,
  setStaffActiveAction,
  cancelStaffSetupAction,
  deleteStaffAccountAction,
} from "./actions";
import type { StaffActionResult } from "./provisioning";
export function StaffWorkspace({ staff, managementAvailable = true, lifecycleAvailable = true }: { staff: StaffMember[]; managementAvailable?: boolean; lifecycleAvailable?: boolean }) {
  const showSuccess = useSuccessBanner();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<StaffActionResult | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [selectedError, setSelectedError] = useState('');
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deletionInFlight = useRef(false);
  function presentResult(result: StaffActionResult, name?: string, summary?: string) {
    if (result.ok && result.emailSent !== false && !result.error) {
      showSuccess(summary ?? result.message ?? 'Staff account updated.', name);
      setNotice(null);
    } else setNotice(result);
  }
  const runAction = async (operation: () => Promise<StaffActionResult>) => {
    try {
      return await operation();
    } catch {
      return {
        ok: false,
        error: "The request could not be completed. Retry or refresh.",
      };
    }
  };
  const cancelled = (member: StaffMember) =>
    member.setupCancelled;
  return (
    <>
      {!managementAvailable && <p role="status">Staff account management is not available yet. Existing profiles are shown below; contact your system administrator to enable account controls.</p>}
      <form
        className="staff-card"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          startTransition(async () => {
            const result = await runAction(() =>
              createStaffAction({
                displayName: data.get("displayName"),
                email: data.get("email"),
                role: data.get("role"),
              }),
            );
            presentResult(result, String(data.get("displayName") ?? ""), "Staff account created");
            if (result.ok) form.reset();
          });
        }}
      >
        <h2 className="staff-section-heading">Add staff account</h2>
        <p>
          Staff receive an email to set their own password. Access stays
          inactive until setup is complete.
        </p>
        <fieldset className="arrival-form-grid" disabled={pending || !managementAvailable}>
          <label className="inventory-field">
            Full name
            <input
              name="displayName"
              required
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <label className="inventory-field">
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label className="inventory-field">
            Role
            <select name="role" defaultValue="receptionist">
              <option value="receptionist">Receptionist</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </label>
          <button className="button button-primary" type="submit">
            {pending ? "Working…" : "Create account and send setup email"}
          </button>
        </fieldset>
      </form>
      {notice && (
        <p role={notice.ok ? "status" : "alert"}>
          {notice.error ?? notice.message}
        </p>
      )}
      <div className="staff-list">
        {staff.map((member) => (
          <article className="staff-card" key={member.userId}>
            <div className="inspection-card-head">
              <div>
                <p className="stay-room">{member.role}</p>
                <h2 className="staff-section-heading">{member.displayName}</h2>
              </div>
              <span
                className={`status-badge ${member.active ? "status-occupied" : "status-muted"}`}
              >
                {member.deletionPending
                  ? 'Deletion pending'
                  : member.setupPending
                  ? "Setup pending"
                  : cancelled(member)
                    ? "Setup cancelled"
                    : member.active
                      ? "Active"
                      : "Inactive"}
              </span>
            </div>
            <dl className="inspection-facts">
              <div>
                <dt>Email</dt>
                <dd>{member.email ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{member.role}</dd>
              </div>
            </dl>
            {managementAvailable && member.role !== "owner" &&
              !cancelled(member) && !member.deletionPending &&
              (member.setupPending ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    className="button button-secondary"
                    onClick={() =>
                      startTransition(async () =>
                        presentResult(
                          await runAction(() =>
                            retryStaffSetupAction(member.userId),
                          ),
                          member.displayName,
                          "Setup email requested",
                        ),
                      )
                    }
                  >
                    Retry setup email
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="button button-secondary"
                    onClick={() => { setSelectedError(''); setSelected(member); }}
                  >
                    Cancel setup
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  className="button button-secondary"
                  onClick={() => { setSelectedError(''); setSelected(member); }}
                >
                  {member.active ? "Deactivate access" : "Activate access"}
                </button>
              ))}
            {managementAvailable && lifecycleAvailable && member.role !== 'owner' && !member.active && !member.setupPending && (
              <button type="button" className="text-button staff-delete" disabled={pending} onClick={() => { setDeleteError(''); setDeleting(member); }}>
                {member.deletionPending ? 'Retry delete account' : 'Delete account'}
              </button>
            )}
            {member.deletionPending ? <p>Deletion has not finished. Access remains inactive; retry to complete it.</p> : null}
          </article>
        ))}
      </div>
      {selected && (
        <TaskSheet pending={pending} dirty={false} onClose={() => setSelected(null)} title={`${selected.setupPending ? 'Cancel setup for' : selected.active ? 'Deactivate' : 'Activate'} ${selected.displayName}?`}
          submitVariant={selected.setupPending || selected.active ? 'danger' : 'primary'}
          submitLabel={pending ? 'Working…' : selected.setupPending ? 'Cancel staff setup' : selected.active ? 'Deactivate access' : 'Activate access'}
          onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await runAction(() =>
                  selected.setupPending
                    ? cancelStaffSetupAction({
                        userId: selected.userId,
                        reason: String(data.get("reason") ?? ""),
                      })
                    : setStaffActiveAction({
                        userId: selected.userId,
                        expectedActive: selected.active,
                        active: !selected.active,
                        reason: String(data.get("reason") ?? ""),
                      }),
                );
                if (result.ok) {
                  presentResult(result, selected.displayName, selected.setupPending ? "Staff setup cancelled" : selected.active ? "Staff access deactivated" : "Staff access activated");
                  setSelected(null);
                } else setSelectedError(result.error ?? 'The account could not be updated. Retry.');
              });
            }}>
          <p className="dialog-note">
            {selected.setupPending
              ? "This cancels setup and keeps access inactive. Existing setup links cannot activate this account."
              : selected.active
                ? "This removes access to hotel operations and revokes sessions on all devices. Open devices will return to sign-in on their next access check."
                : "This restores access to hotel operations. Staff must sign in again; previous sessions stay revoked."}
          </p>
            <label className="inventory-field">
              Reason
              <textarea
                name="reason"
                required
                maxLength={500}
                disabled={pending}
              />
            </label>
          {selectedError ? <p className="form-error" role="alert">{selectedError}</p> : null}
        </TaskSheet>
      )}
      {deleting && (
        <TaskSheet title={`Delete ${deleting.displayName}'s account?`} pending={pending} dirty={false} onClose={() => setDeleting(null)}
          submitVariant="danger" submitLabel={pending ? 'Deleting…' : 'Delete account permanently'} onSubmit={event => {
            event.preventDefault();
            if (deletionInFlight.current) return;
            const data = new FormData(event.currentTarget);
            deletionInFlight.current = true;
            setDeleteError('');
            startTransition(async () => {
              try {
                const result = await runAction(() => deleteStaffAccountAction({ userId: deleting.userId, reason: data.get('reason'), confirmation: data.get('confirmation') }));
                if (result.ok) { presentResult(result, deleting.displayName); setDeleting(null); }
                else setDeleteError(result.error ?? 'Deletion could not be completed. Retry.');
              } finally { deletionInFlight.current = false; }
            });
          }}>
            <p className="dialog-note">This permanently removes their sign-in account. It cannot be reactivated. Past payments, inspections, and activity history keep their staff attribution.</p>
            <label className="inventory-field">Reason<textarea name="reason" required maxLength={500} disabled={pending} /></label>
            <label className="inventory-field">Type DELETE to confirm<input name="confirmation" required pattern="DELETE" autoComplete="off" spellCheck={false} disabled={pending} /></label>
            {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
        </TaskSheet>
      )}
    </>
  );
}
