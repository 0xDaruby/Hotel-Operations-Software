'use client';

import { useState, useTransition } from 'react';
import { recordArrivalAction } from './actions';
import { deadlineFromNow, formatDateLabel, formatNaira } from './format';

export type ReadyRoom = { id: string; roomNumber: string; categoryName: string; dailyRate: number };

type ArrivalFormProps = {
  readyRooms: ReadyRoom[];
};

export function ArrivalForm({ readyRooms }: ArrivalFormProps) {
  const [roomId, setRoomId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [paidDays, setPaidDays] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const room = readyRooms.find((item) => item.id === roomId) ?? null;
  const days = Number.isFinite(paidDays) ? Math.max(1, Math.min(30, Math.trunc(paidDays))) : 1;
  const amount = room ? room.dailyRate * days : 0;
  const deadline = room ? deadlineFromNow(days) : null;
  const canSubmit = Boolean(room) && guestName.trim() !== '' && confirmed && !pending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !canSubmit) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await recordArrivalAction({
        roomId: room.id,
        guestName,
        guestPhone,
        paidDays: days,
        expectedAmount: amount,
      });
      if (result.ok) {
        setNotice(`Arrival recorded — ${room.roomNumber} is occupied by ${guestName.trim()}.`);
        setRoomId('');
        setGuestName('');
        setGuestPhone('');
        setPaidDays(1);
        setConfirmed(false);
      } else {
        setError(result.error ?? 'Could not record the arrival.');
      }
    });
  }

  return (
    <form className="arrival-form" onSubmit={submit}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
      <div className="arrival-grid">
        <label className="inventory-field">
          <span>Ready room</span>
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)} required>
            <option value="">Choose a ready room</option>
            {readyRooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.roomNumber} — {item.categoryName} — {formatNaira(item.dailyRate)}/day
              </option>
            ))}
          </select>
        </label>
        <label className="inventory-field">
          <span>Guest name</span>
          <input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="e.g. Ada Okafor" required />
        </label>
        <label className="inventory-field">
          <span>Guest phone (optional)</span>
          <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="e.g. 0803 000 0000" />
        </label>
        <label className="inventory-field">
          <span>Paid days (24 hours each)</span>
          <input type="number" min={1} max={30} step={1} value={paidDays} onChange={(event) => setPaidDays(Number(event.target.value))} required />
        </label>
      </div>
      {room ? (
        <div className="arrival-preview" aria-live="polite">
          <p><span>Rate</span><strong>{formatNaira(room.dailyRate)} × {days} {days === 1 ? 'day' : 'days'}</strong></p>
          <p><span>Total due</span><strong>{formatNaira(amount)}</strong></p>
          <p><span>Deadline</span><strong>{formatDateLabel(deadline ?? '')}</strong></p>
        </div>
      ) : (
        <p className="arrival-hint">Only rooms that are unoccupied and clear of inspection requirements can be selected.</p>
      )}
      <label className="arrival-confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>Payment of {formatNaira(amount)} received from the guest — confirm to record.</span>
      </label>
      <div className="arrival-actions">
        <button className="button button-primary" type="submit" disabled={!canSubmit}>
          {pending ? 'Recording…' : 'Record arrival'}
        </button>
      </div>
    </form>
  );
}
