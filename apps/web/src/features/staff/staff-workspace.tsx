"use client";
import { useState, useTransition } from "react";
import { Dialog } from '@/components/dialog';
import type { StaffMember } from "./staff-management";
import {
  createStaffAction,
  retryStaffSetupAction,
  setStaffActiveAction,
  cancelStaffSetupAction,
} from "./actions";
import type { StaffActionResult } from "./provisioning";
export function StaffWorkspace({ staff, managementAvailable = true }: { staff: StaffMember[]; managementAvailable?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<StaffActionResult | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
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
            setNotice(result);
            if (result.ok) form.reset();
          });
        }}
      >
        <h3>Add staff account</h3>
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
                <h3>{member.displayName}</h3>
              </div>
              <span
                className={`status-badge ${member.active ? "status-occupied" : "status-muted"}`}
              >
                {member.setupPending
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
              !cancelled(member) &&
              (member.setupPending ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    className="button button-secondary"
                    onClick={() =>
                      startTransition(async () =>
                        setNotice(
                          await runAction(() =>
                            retryStaffSetupAction(member.userId),
                          ),
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
                    onClick={() => setSelected(member)}
                  >
                    Cancel setup
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  className="button button-secondary"
                  onClick={() => setSelected(member)}
                >
                  {member.active ? "Deactivate access" : "Activate access"}
                </button>
              ))}
          </article>
        ))}
      </div>
      {selected && (
        <Dialog open onClose={() => { if (!pending) setSelected(null); }} title={`${selected.setupPending ? 'Cancel setup for' : selected.active ? 'Deactivate' : 'Activate'} ${selected.displayName}?`}>
          <p>
            {selected.setupPending
              ? "This cancels setup and keeps access inactive. Existing setup links cannot activate this account."
              : selected.active
                ? "This removes access to hotel operations."
                : "This restores access to hotel operations."}
          </p>
          <form
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
                setNotice(result);
                if (result.ok) setSelected(null);
              });
            }}
          >
            <label className="inventory-field">
              Reason
              <textarea
                name="reason"
                required
                maxLength={500}
                disabled={pending}
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="button button-primary"
            >
              Confirm{" "}
              {selected.setupPending
                ? "setup cancellation"
                : selected.active
                  ? "deactivation"
                  : "activation"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="button button-secondary"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
