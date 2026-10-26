// Uses production components and action adapters against the disposable database.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OperationsShell } from '@/components/operations-shell';
import { OperationsRefresh } from '@/components/operations-refresh';
import { SuccessBannerProvider } from '@/components/success-banner';
import { InspectionWorkspace } from '@/features/inspections/inspection-workspace';
import { MaintenanceWorkspace } from '@/features/maintenance/maintenance-workspace';
import { RoomBoard } from '@/features/inventory/room-board';
import { InventoryOverview } from '@/features/inventory/inventory-overview';
import { summarizeInventoryMetrics } from '@/features/inventory/inventory-summary';
import { buildOwnerAttentionItems } from '@/features/inventory/owner-overview-model';
import { ArrivalForm } from '@/features/stays/arrival-form';
import { PaymentsView } from '@/features/stays/payments-view';
import { StaffWorkspace } from '@/features/staff/staff-workspace';

const role = new URLSearchParams(location.search).get('role') || 'supervisor';
window.fixtureRole = role;
window.fixtureRevision = 0;

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch('/snapshot');
        if (!response.ok) throw new Error('Fixture data unavailable. Retry after reconnecting.');
        const next = await response.json();
        if (active) { setData(next); setError(''); window.fixtureRevision++; }
      } catch (e) { if (active) setError(e.message); }
    }
    window.fixtureRefresh = refresh;
    window.addEventListener('fixture-refresh', refresh);
    void refresh();
    return () => { active = false; window.removeEventListener('fixture-refresh', refresh); };
  }, []);
  if (!data) return <main><h1>Isolated UI validation</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading test hotel…'}</p></main>;
  const category = data.categories[0];
  const rooms = data.rooms.map(room => ({ id: room.id, number: room.room_number, categoryId: room.category_id, categoryName: category.name, dailyRate: Number(category.daily_rate), active: room.active, floor: 'First floor' }));
  const inspections = data.inspections.map(i => ({ id: i.id, roomId: i.room_id, roomNumber: i.room_number, trigger: i.trigger, status: i.status, dueAt: i.due_at, inspectionDay: String(i.inspection_day).slice(0, 10), findings: i.findings, version: i.version }));
  const issues = data.issues.map(i => ({ id: i.id, roomId: i.room_id, roomNumber: i.room_number, issueType: i.issue_type, detail: i.detail, reportedAt: i.reported_at, version: i.version }));
  const issueCounts = Object.fromEntries(rooms.map(room => [room.id, issues.filter(i => i.roomId === room.id).length]));
  const occupied = data.stays.map(s => s.room_id);
  const due = inspections.map(i => i.roomId);
  const inventory = { rooms, categories: data.categories.map(c => ({ ...c, dailyRate: Number(c.daily_rate) })) };
  const summary = summarizeInventoryMetrics({ rooms, occupiedRoomIds: occupied, inspectionDueRoomIds: due, maintenanceIssueCountByRoomId: issueCounts });
  const readyRooms = rooms.filter(r => !occupied.includes(r.id) && !due.includes(r.id) && !issueCounts[r.id]).map(r => ({ id: r.id, roomNumber: r.number, categoryName: r.categoryName, dailyRate: r.dailyRate }));
  const attention = buildOwnerAttentionItems({ now: data.now, stays: data.stays, inspections: data.inspections, maintenanceIssues: data.issues, roomNumberById: new Map(rooms.map(r => [r.id, r.number])) });
  const route = location.pathname;
  let content;
  if (route === '/staff') content = <StaffWorkspace staff={data.staff} />;
  else if (route === '/inspections') content = <InspectionWorkspace requirements={inspections} canRecord={role === 'supervisor' || role === 'secondSupervisor'} />;
  else if (route === '/maintenance') content = <MaintenanceWorkspace issues={issues} rooms={rooms.map(r => ({ id: r.id, roomNumber: r.number }))} canReport={role !== 'receptionist'} canResolve={role !== 'receptionist'} />;
  else if (route === '/rooms') content = <RoomBoard rooms={rooms} categories={inventory.categories} occupiedRoomIds={occupied} inspectionDueRoomIds={due} maintenanceIssueCountByRoomId={issueCounts} />;
  else if (route === '/stays') content = <><h2>Record arrival</h2><ArrivalForm readyRooms={readyRooms} /></>;
  else if (route === '/payments') content = <PaymentsView payments={data.payments.map(p => ({ id: p.id, kind: p.kind, amount: Number(p.amount), receivedOn: String(p.received_on).slice(0,10), createdByName: 'Test Receptionist with a long name', roomNumber: rooms.find(r=>r.id===data.stays.find(s=>s.id===p.stay_id)?.room_id)?.number || 'Test room' }))} total={data.payments.reduce((a,p)=>a+Number(p.amount),0)} date="2026-10-19" today="2026-10-19" />;
  else content = <InventoryOverview inventory={inventory} summary={summary} occupancyPercent={Math.round(summary.occupiedRooms / summary.activeRooms * 100)} attentionItems={attention} occupiedRoomIds={occupied} inspectionDueRoomIds={due} maintenanceIssueCountByRoomId={issueCounts} now={data.now} paymentTotals={{ today: 123456789, yesterday: 98765432 }} movement={{ arrivals: data.stays.length, departures: 0, extensions: 0, departuresDueSoon: 0, initialPayments: 123456789, extensionPayments: 0 }} teamPulseEvents={data.events.map(e=>({ id:e.id, action:e.action, roomNumber:rooms.find(r=>r.id===e.room_id)?.number, actorName:e.actor_name, createdAt:e.created_at, details:null }))} />;
  return <SuccessBannerProvider><OperationsShell profile={{ role: role === 'secondSupervisor' ? 'supervisor' : role, displayName: `Test ${role}`, userId: 'test-only', hotelId: 'test-only', active: true }} attentionCount={attention.length} inspectionCount={inspections.length} maintenanceCount={issues.length} departureCount={0}>
    <OperationsRefresh />
    <p className="fixture-notice">Isolated validation · synthetic hotel · no live data</p>
    {error ? <p role="alert">{error}</p> : null}
    {content}
  </OperationsShell></SuccessBannerProvider>;
}
createRoot(document.getElementById('root')).render(<App />);
