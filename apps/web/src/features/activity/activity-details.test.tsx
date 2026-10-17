import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { getActivityDetails } from './activity-details';
import { ActivityEventDetails } from './activity-event-details';
import { getActivityContextLabel } from './activity-view';

function details(action: string, before: unknown, after: unknown, reason: string | null = null) {
  return getActivityDetails({ action, details: { before, after }, reason });
}

test('arrival is a useful summary without empty comparisons or repeated identity', () => {
  const result = details('stay.arrived', null, { room: '104', guest: 'Ada', days: 2, rate: 40000, amount: 80000, arrival: '2026-10-17T12:58:00Z', departure_due: '2026-10-19T12:58:00Z' });
  assert.deepEqual(result.items.map(item => item.label), ['Length of stay', 'Daily rate', 'Payment recorded', 'Arrival', 'Departure due']);
  assert.ok(result.items.every(item => item.previous === undefined));
  assert.equal(result.items[0].value, '2 days');
  assert.match(result.items[3].value, /13:58 WAT/);
  const html = renderToStaticMarkup(<ActivityEventDetails details={result} />);
  assert.doesNotMatch(html, /Not recorded|Before|After|<table/);
  assert.match(html, /<dl/);
});

test('extension compares meaningful changes and presents its payment once', () => {
  const result = details('stay.extended', { paid_days: 1, departure_due: '2026-10-17T12:00:00Z' }, { paid_days: 3, departure_due: '2026-10-19T12:00:00Z', room: '101', extension_amount: 80000 });
  assert.deepEqual(result.items.map(item => [item.label, item.previous !== undefined]), [['Length of stay', true], ['Departure due', true], ['Extension payment', false]]);
  assert.equal(result.items[0].previous, '1 day');
  assert.equal(result.items[0].value, '3 days');
});

test('room move compares recorded source and destination without inferring from live room data', () => {
  const result = details('stay.moved', { room: '101', guest: 'Ada' }, { from_room: '101', to_room: '204' }, 'Requested a quieter room');
  assert.deepEqual(result, { items: [{ label: 'Room', previous: 'Room 101', value: 'Room 204' }], note: 'Requested a quieter room' });
});

test('correction hides unchanged fields and distinguishes a cleared phone from missing history', () => {
  const result = details('stay.corrected', { guest: 'Ada', guest_phone: '123', paid_days: 2 }, { guest: 'Ada', guest_phone: null, paid_days: 3, recorded_amount: 0 });
  assert.deepEqual(result.items.map(item => [item.label, item.previous, item.value]), [['Guest phone', '123', 'Not provided'], ['Length of stay', '2 days', '3 days'], ['Recorded stay amount', undefined, '₦0']]);
  const sparse = details('stay.corrected', {}, { paid_days: 3 });
  assert.deepEqual(sparse.items, [{ label: 'Length of stay', value: '3 days' }]);
});

test('departure and void avoid irrelevant state comparisons', () => {
  const departed = details('stay.departed', { room: '101', guest: 'Ada', departure_due: '2026-10-17T12:00:00Z' }, { departed_at: '2026-10-17T11:00:00Z', inspection_triggered: 'departure' });
  assert.deepEqual(departed.items.map(item => item.label), ['Departure confirmed at', 'Scheduled departure']);
  assert.ok(departed.items.every(item => item.previous === undefined));
  assert.deepEqual(details('stay.voided', { room: '101', guest: 'Ada', status: 'active' }, { status: 'void' }, 'Duplicate entry'), { items: [], note: 'Duplicate entry' });
});

test('all inspection outcomes retain findings without repeated reason or status', () => {
  for (const outcome of ['approved', 'attention', 'access_blocked']) {
    const result = details(`inspection.${outcome}`, { status: 'pending', trigger: 'departure', findings: null }, { status: outcome, trigger: 'departure', findings: 'Window needs repair', room: '101' }, 'Window needs repair');
    assert.deepEqual(result, { items: [{ label: 'Inspection for', value: 'After departure' }, { label: 'Findings', value: 'Window needs repair' }], note: null });
  }
});

test('maintenance keeps the reported problem alongside the resolution', () => {
  const reported = details('maintenance.reported', null, { room: '101', status: 'open', issue_type: 'air_conditioning', detail: 'Not cooling' }, 'Not cooling');
  assert.deepEqual(reported, { items: [{ label: 'Issue', value: 'Air conditioning' }, { label: 'Reported problem', value: 'Not cooling' }], note: null });
  const resolved = details('maintenance.resolved', { status: 'open', issue_type: 'air_conditioning', detail: 'Not cooling' }, { status: 'resolved', issue_type: 'air_conditioning', resolution_detail: 'Replaced compressor' }, 'Replaced compressor');
  assert.deepEqual(resolved, { items: [{ label: 'Issue', value: 'Air conditioning' }, { label: 'Reported problem', value: 'Not cooling' }, { label: 'Resolution', value: 'Replaced compressor' }], note: null });
});

test('unexpected sparse facts stay readable and absent fields never imply deletion', () => {
  const result = details('staff.updated', { note: 'Original note' }, { active: false, attempts: 0, payload: { internal: true }, hotel_id: 'hidden' });
  assert.deepEqual(result.items, [{ label: 'Previously recorded note', value: 'Original note' }, { label: 'Active', value: 'No' }, { label: 'Attempts', value: '0' }]);
  assert.deepEqual(details('stay.arrived', null, null), { items: [], note: null });
});

test('historical identity comes from the event when the current stay has since changed', () => {
  assert.equal(getActivityContextLabel({ roomNumber: '204', guestName: 'Corrected name', details: { before: null, after: { room: '101', guest: 'Original name' } } }), 'Room 101 · Original name');
  assert.equal(getActivityContextLabel({ roomNumber: '301', details: { before: { room: '101', guest: 'Ada' }, after: { from_room: '101', to_room: '204' } } }), 'Room 204 · Ada');
});
