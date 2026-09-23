'use client';

import { useRouter } from 'next/navigation';
import { UserCheck01Icon } from '@/components/icons';
import { useState, useTransition } from 'react';
import { Dialog } from '@/components/dialog';
import {
  confirmDepartureAction,
  correctStayAction,
  extendStayAction,
  moveStayAction,
  voidStayAction,
  type ActionResult,
} from './actions';
import { deadlineFrom, formatDateLabel, formatDateTime, formatNaira } from './format';
import type { PaymentRecord, Stay, StayTotals } from './stays';
import type { ReadyRoom } from './arrival-form';

type StayListProps = {
  stays: Stay[];
  payments: PaymentRecord[];
  totals: Record<string, StayTotals>;
  readyRooms: ReadyRoom[];
  canRecord: boolean;
};

type DialogState = { type: 'extend' | 'move' | 'correct' | 'void' | 'depart'; stay: Stay } | null;

function useAction(onDone: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        onDone();
      } else {
        setError(result.error ?? 'The operation could not be completed.');
      }
    });
  }
  return { pending, error, run };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="inventory-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function StayList({ stays, payments, totals, readyRooms, canRecord }: StayListProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  if (!stays.length) {
    return (
      <div className="inventory-empty" role="status">
        <h2>No active stays</h2>
        <p>Record a walk-in arrival to occupy a ready room.</p>
      </div>
    );
  }

  return (
    <div className="stay-list" aria-live="polite">
      {stays.map((stay) => {
        const stayPayments = payments.filter((payment) => payment.stayId === stay.id);
        const total = totals[stay.id]?.totalAmount ?? 0;
        return (
          <article className="stay-card" key={stay.id}>
            <div className="stay-card-head">
              <div>
                <p className="stay-room">{stay.roomNumber}</p>
                <h3>{stay.guestName}</h3>
              </div>
              <span className="status-badge status-occupied"><UserCheck01Icon className="icon icon-sm icon-status-occupied" aria-hidden="true" />Occupied</span>
            </div>
            <dl className="stay-facts">
              <div><dt>Category</dt><dd>{stay.categoryName}</dd></div>
              <div><dt>Arrival</dt><dd>{formatDateTime(stay.arrivalAt)}</dd></div>
              <div><dt>Deadline</dt><dd>{formatDateTime(stay.departureDueAt)}</dd></div>
              <div><dt>Paid days</dt><dd>{stay.paidDays}</dd></div>
              <div><dt>Recorded</dt><dd>{formatNaira(total)}</dd></div>
            </dl>
            {stayPayments.length ? (
              <ul className="stay-payments">
                {stayPayments.map((payment) => (
                  <li key={payment.id}>
                    <span className="status-badge status-neutral">{payment.kind}</span>
                    <span>{formatNaira(payment.amount)}</span>
                    <span>received {payment.receivedOn}</span>
                    <span>by {payment.createdByName}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {canRecord ? (
              <div className="stay-actions">
                <button className="text-button" type="button" onClick={() => setDialog({ type: 'extend', stay })}>Extend</button>
                <button className="text-button" type="button" onClick={() => setDialog({ type: 'move', stay })}>Move room</button>
                <button className="text-button" type="button" onClick={() => setDialog({ type: 'correct', stay })}>Correct</button>
                <button className="text-button" type="button" onClick={() => setDialog({ type: 'void', stay })}>Void</button>
                <button className="button button-secondary" type="button" onClick={() => setDialog({ type: 'depart', stay })}>Confirm departure</button>
              </div>
            ) : null}
          </article>
        );
      })}
      {dialog?.type === 'extend' ? <ExtendDialog stay={dialog.stay} onClose={close} /> : null}
      {dialog?.type === 'move' ? <MoveDialog stay={dialog.stay} readyRooms={readyRooms} onClose={close} /> : null}
      {dialog?.type === 'correct' ? <CorrectDialog stay={dialog.stay} onClose={close} /> : null}
      {dialog?.type === 'void' ? <VoidDialog stay={dialog.stay} onClose={close} /> : null}
      {dialog?.type === 'depart' ? <DepartDialog stay={dialog.stay} onClose={close} /> : null}
    </div>
  );
}

function ExtendDialog({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const [addedDays, setAddedDays] = useState(1);
  const days = Number.isFinite(addedDays) ? Math.max(1, Math.min(30, Math.trunc(addedDays))) : 1;
  const amount = stay.originalDailyRate * days;
  const { pending, error, run } = useAction(onClose);

  return (
    <Dialog open title={`Extend stay — ${stay.roomNumber}`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={(event) => { event.preventDefault(); run(() => extendStayAction({ stayId: stay.id, addedDays: days, expectedAmount: amount, expectedVersion: stay.version })); }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">Extension is charged at the original daily rate ({formatNaira(stay.originalDailyRate)}) and recorded as a separate extension payment on today&apos;s date.</p>
        <Field label="Additional days">
          <input type="number" min={1} max={30} step={1} value={addedDays} onChange={(event) => setAddedDays(Number(event.target.value))} required />
        </Field>
        <div className="arrival-preview" aria-live="polite">
          <p><span>Extension charge</span><strong>{formatNaira(amount)}</strong></p>
          <p><span>New deadline</span><strong>{formatDateLabel(deadlineFrom(stay.departureDueAt, days))}</strong></p>
        </div>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Extending…' : 'Record extension'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({ stay, readyRooms, onClose }: { stay: Stay; readyRooms: ReadyRoom[]; onClose: () => void }) {
  const candidates = readyRooms.filter((room) => room.id !== stay.roomId);
  const [toRoomId, setToRoomId] = useState('');
  const [reason, setReason] = useState('');
  const { pending, error, run } = useAction(onClose);
  const target = candidates.find((room) => room.id === toRoomId) ?? null;

  return (
    <Dialog open title={`Move stay — ${stay.roomNumber}`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={(event) => { event.preventDefault(); if (!target) return; run(() => moveStayAction({ stayId: stay.id, toRoomId: target.id, reason, expectedVersion: stay.version })); }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">The vacated room is sent to inspection before it can be sold again.</p>
        <Field label="New room">
          <select value={toRoomId} onChange={(event) => setToRoomId(event.target.value)} required>
            <option value="">Choose a ready room</option>
            {candidates.map((room) => (
              <option key={room.id} value={room.id}>{room.roomNumber} — {room.categoryName}</option>
            ))}
          </select>
        </Field>
        <Field label="Reason for move">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} required />
        </Field>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={!target || reason.trim() === '' || pending}>{pending ? 'Moving…' : 'Move stay'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function CorrectDialog({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const [guestName, setGuestName] = useState(stay.guestName);
  const [guestPhone, setGuestPhone] = useState(stay.guestPhone ?? '');
  const [paidDays, setPaidDays] = useState(stay.paidDays);
  const [reason, setReason] = useState('');
  const { pending, error, run } = useAction(onClose);
  const days = Number.isFinite(paidDays) ? Math.max(1, Math.min(30, Math.trunc(paidDays))) : stay.paidDays;

  return (
    <Dialog open title={`Correct stay — ${stay.roomNumber}`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={(event) => { event.preventDefault(); run(() => correctStayAction({ stayId: stay.id, guestName, guestPhone, paidDays: days, reason, expectedVersion: stay.version })); }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">Corrections are attributed to you and never alter recorded payment rows.</p>
        <Field label="Guest name">
          <input value={guestName} onChange={(event) => setGuestName(event.target.value)} required />
        </Field>
        <Field label="Guest phone (optional)">
          <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} />
        </Field>
        <Field label="Paid days">
          <input type="number" min={1} max={30} step={1} value={paidDays} onChange={(event) => setPaidDays(Number(event.target.value))} required />
        </Field>
        <Field label="Reason for correction">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} required />
        </Field>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={guestName.trim() === '' || reason.trim() === '' || pending}>{pending ? 'Saving…' : 'Save correction'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function VoidDialog({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { pending, error, run } = useAction(onClose);

  return (
    <Dialog open title={`Void stay — ${stay.roomNumber}`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={(event) => { event.preventDefault(); run(() => voidStayAction({ stayId: stay.id, reason, expectedVersion: stay.version })); }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">Voiding removes the stay from totals and sends {stay.roomNumber} to inspection. Payment rows remain in the audit history.</p>
        <Field label="Reason for void">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} required />
        </Field>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-danger" type="submit" disabled={reason.trim() === '' || pending}>{pending ? 'Voiding…' : 'Void stay'}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function DepartDialog({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const { pending, error, run } = useAction(onClose);

  return (
    <Dialog open title={`Confirm departure — ${stay.roomNumber}`} onClose={onClose}>
      <form className="stay-dialog-form" onSubmit={(event) => { event.preventDefault(); run(() => confirmDepartureAction({ stayId: stay.id, expectedVersion: stay.version })); }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="dialog-note">{stay.guestName} is leaving {stay.roomNumber}. The room stays occupied until you confirm, and an inspection requirement is created automatically on confirmation.</p>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Confirming…' : 'Confirm departure'}</button>
        </div>
      </form>
    </Dialog>
  );
}
