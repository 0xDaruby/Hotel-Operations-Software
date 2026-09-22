'use client';

import { useState, useTransition } from 'react';
import { Dialog } from '@/components/dialog';
import { formatDateTime } from '@/features/stays/format';
import { reportMaintenanceIssueAction, resolveMaintenanceIssueAction } from './actions';
import type { MaintenanceIssue, MaintenanceIssueType, MaintenanceRoom } from './maintenance';

type MaintenanceWorkspaceProps = {
  issues: MaintenanceIssue[];
  rooms: MaintenanceRoom[];
  canReport: boolean;
  canResolve: boolean;
};

const issueTypeLabels: Record<MaintenanceIssueType, string> = {
  air_conditioning: 'Air conditioning',
  furniture: 'Furniture',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  other: 'Other',
};

export function MaintenanceWorkspace({ issues, rooms, canReport, canResolve }: MaintenanceWorkspaceProps) {
  const [selected, setSelected] = useState<MaintenanceIssue | null>(null);

  return (
    <div className="maintenance-layout">
      <section className="maintenance-main" aria-labelledby="maintenance-issues-heading">
        <div className="inventory-intro">
          <div>
            <p className="eyebrow">Maintenance operations</p>
            <h2 id="maintenance-issues-heading">{issues.length} open {issues.length === 1 ? 'issue' : 'issues'}</h2>
          </div>
          <p>Each open issue blocks new room assignment. Resolving an issue does not approve cleanliness or clear any inspection requirement.</p>
        </div>

        {issues.length ? (
          <div className="maintenance-list" aria-live="polite">
            {issues.map((issue) => (
              <article className="maintenance-card" key={issue.id}>
                <div className="inspection-card-head">
                  <div>
                    <p className="stay-room">{issue.roomNumber}</p>
                    <h3>{issueTypeLabels[issue.issueType]}</h3>
                  </div>
                  <span className="status-badge status-danger">Assignment blocked</span>
                </div>
                <dl className="inspection-facts">
                  <div><dt>Reported</dt><dd>{formatDateTime(issue.reportedAt)}</dd></div>
                  <div><dt>Issue</dt><dd>{issueTypeLabels[issue.issueType]}</dd></div>
                </dl>
                {issue.detail ? <p className="inspection-findings"><strong>Detail:</strong> {issue.detail}</p> : <p className="inspection-findings">No additional detail recorded.</p>}
                {canResolve ? (
                  <div className="stay-actions">
                    <button className="button button-secondary" type="button" onClick={() => setSelected(issue)}>Record resolution</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="inventory-empty" role="status">
            <h2>No open maintenance issues</h2>
            <p>Rooms with no open maintenance issues still need to meet their own occupancy and inspection conditions before arrival.</p>
          </div>
        )}
      </section>

      <aside className="stays-side">
        {canReport ? <ReportIssueForm rooms={rooms} /> : (
          <div className="maintenance-role-note">
            <h2>Issue reporting</h2>
            <p>Owners and Supervisors can report maintenance issues. Open issues remain visible here to all staff.</p>
          </div>
        )}
      </aside>

      {selected ? <ResolveIssueDialog issue={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ReportIssueForm({ rooms }: { rooms: MaintenanceRoom[] }) {
  const [roomId, setRoomId] = useState('');
  const [issueType, setIssueType] = useState<MaintenanceIssueType>('air_conditioning');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canSubmit = roomId !== '' && (issueType !== 'other' || detail.trim() !== '') && !pending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await reportMaintenanceIssueAction({ roomId, issueType, detail });
      if (result.ok) {
        setNotice('Issue reported. The room is now blocked from new assignment.');
        setRoomId('');
        setIssueType('air_conditioning');
        setDetail('');
      } else {
        setError(result.error ?? 'The maintenance issue could not be reported.');
      }
    });
  }

  return (
    <form className="arrival-form" onSubmit={submit}>
      <div>
        <p className="eyebrow">Supervisor control</p>
        <h2>Report issue</h2>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
      <label className="inventory-field">
        <span>Room</span>
        <select value={roomId} onChange={(event) => setRoomId(event.target.value)} required>
          <option value="">Choose a room</option>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomNumber}</option>)}
        </select>
      </label>
      <label className="inventory-field">
        <span>Issue type</span>
        <select value={issueType} onChange={(event) => setIssueType(event.target.value as MaintenanceIssueType)}>
          {Object.entries(issueTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="inventory-field">
        <span>{issueType === 'other' ? 'Detail' : 'Detail (optional)'}</span>
        <textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={4} maxLength={250} required={issueType === 'other'} />
      </label>
      <p className="arrival-hint">Reporting maintenance blocks new assignment only. It does not end an occupied stay or replace an inspection.</p>
      <button className="button button-primary" type="submit" disabled={!canSubmit}>{pending ? 'Reporting…' : 'Report issue'}</button>
    </form>
  );
}

function ResolveIssueDialog({ issue, onClose }: { issue: MaintenanceIssue; onClose: () => void }) {
  const [resolutionDetail, setResolutionDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canSubmit = resolutionDetail.trim() !== '' && !pending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await resolveMaintenanceIssueAction({
        issueId: issue.id,
        resolutionDetail,
        expectedVersion: issue.version,
      });
      if (result.ok) onClose();
      else setError(result.error ?? 'The maintenance issue could not be resolved.');
    });
  }

  return (
    <Dialog open title={`Resolve room ${issue.roomNumber} issue`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">This resolves only this maintenance issue. It does not change an active stay or approve room cleanliness.</p>
        <label className="inventory-field">
          <span>Resolution detail</span>
          <textarea value={resolutionDetail} onChange={(event) => setResolutionDetail(event.target.value)} rows={4} maxLength={250} required />
        </label>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={!canSubmit}>{pending ? 'Resolving…' : 'Save resolution'}</button>
        </div>
      </form>
    </Dialog>
  );
}