'use client';

import { useState, useTransition } from 'react';
import { TaskDaily02Icon } from '@/components/icons';
import { Dialog } from '@/components/dialog';
import { formatDateTime } from '@/features/stays/format';
import { submitInspectionAction } from './actions';
import type { InspectionRequirement } from './inspections';

type InspectionWorkspaceProps = {
  requirements: InspectionRequirement[];
  canRecord: boolean;
};

type Outcome = 'approved' | 'attention' | 'access_blocked';

function triggerLabel(trigger: InspectionRequirement['trigger']) {
  return trigger === 'daily' ? 'Daily check' : 'Departure check';
}

function statusLabel(status: InspectionRequirement['status']) {
  if (status === 'access_blocked') return 'Access blocked';
  return status === 'attention' ? 'Attention needed' : 'Pending';
}

function statusClass(status: InspectionRequirement['status']) {
  if (status === 'access_blocked') return 'status-badge status-muted';
  return status === 'attention' ? 'status-badge status-danger' : 'status-badge status-pending';
}

function statusIcon(status: InspectionRequirement['status']) {
  if (status === 'access_blocked') return null;
  return <TaskDaily02Icon className={`icon icon-sm ${status === 'attention' ? 'icon-status-danger' : 'icon-status-pending'}`} aria-hidden="true" />;
}

export function InspectionWorkspace({ requirements, canRecord }: InspectionWorkspaceProps) {
  const [selected, setSelected] = useState<InspectionRequirement | null>(null);

  return (
    <section className="inspection-workspace" aria-labelledby="inspection-queue-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Shared supervisor queue</p>
          <h2 id="inspection-queue-heading">{requirements.length} open {requirements.length === 1 ? 'inspection' : 'inspections'}</h2>
        </div>
        <p>No inspection assignments or claims. Supervisors can complete any open requirement, and all unfinished work remains in the shared queue.{canRecord ? '' : ' Only Supervisors can record outcomes; this view is read-only.'}</p>
      </div>

      {requirements.length ? (
        <div className="inspection-list" aria-live="polite">
          {requirements.map((requirement) => (
            <article className="inspection-card" key={requirement.id}>
              <div className="inspection-card-head">
                <div>
                  <p className="stay-room">{requirement.roomNumber}</p>
                  <h3>{triggerLabel(requirement.trigger)}</h3>
                </div>
                <span className={statusClass(requirement.status)}>{statusIcon(requirement.status)}{statusLabel(requirement.status)}</span>
              </div>
              <dl className="inspection-facts">
                <div><dt>Due</dt><dd>{formatDateTime(requirement.dueAt)}</dd></div>
                <div><dt>Requirement</dt><dd>{requirement.inspectionDay ?? 'Departure release'}</dd></div>
                <div><dt>Carryover</dt><dd>{requirement.status === 'pending' ? 'New' : 'Awaiting approval'}</dd></div>
              </dl>
              {requirement.findings ? <p className="inspection-findings"><strong>Last finding:</strong> {requirement.findings}</p> : null}
              {canRecord ? (
                <div className="stay-actions">
                  <button className="button button-secondary inspect-action" type="button" onClick={() => setSelected(requirement)}><TaskDaily02Icon className="icon icon-sm icon-status-pending" aria-hidden="true" />Inspect room</button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="inventory-empty" role="status">
          <h2>Nothing awaiting inspection</h2>
          <p>Approved rooms have cleared their current inspection requirement. New daily and departure checks will appear here for every supervisor.</p>
        </div>
      )}

      {selected ? <InspectionDialog requirement={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function InspectionDialog({ requirement, onClose }: { requirement: InspectionRequirement; onClose: () => void }) {
  const [outcome, setOutcome] = useState<Outcome>('approved');
  // Start empty: the previous finding is shown on the card, and must not carry into a new outcome.
  const [findings, setFindings] = useState('');
  const [personallyVerified, setPersonallyVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsFindings = outcome !== 'approved';
  const canSubmit = personallyVerified && (!needsFindings || findings.trim() !== '') && !pending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await submitInspectionAction({
        requirementId: requirement.id,
        outcome,
        findings,
        personallyVerified,
        expectedVersion: requirement.version,
      });
      if (result.ok) onClose();
      else setError(result.error ?? 'The inspection could not be completed.');
    });
  }

  return (
    <Dialog open title={`Inspect room ${requirement.roomNumber}`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">This is a shared queue. Your signed-in profile is recorded as the completing Supervisor, and the result applies only after your personal verification.</p>
        <label className="inventory-field">
          <span>Outcome</span>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)}>
            <option value="approved">Passed — inspection approved</option>
            <option value="attention">Attention needed</option>
            <option value="access_blocked">Access blocked</option>
          </select>
        </label>
        <label className="inventory-field">
          <span>{needsFindings ? 'Reason' : 'Findings (optional)'}</span>
          <textarea value={findings} onChange={(event) => setFindings(event.target.value)} rows={4} maxLength={250} required={needsFindings} />
        </label>
        <label className="arrival-confirm">
          <input type="checkbox" checked={personallyVerified} onChange={(event) => setPersonallyVerified(event.target.checked)} />
          <span>Personally verified: this outcome reflects my direct inspection of room {requirement.roomNumber}.</span>
        </label>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={!canSubmit}>{pending ? 'Saving…' : 'Save outcome'}</button>
        </div>
      </form>
    </Dialog>
  );
}