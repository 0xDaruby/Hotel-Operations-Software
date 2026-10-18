import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarNavigation } from './sidebar-navigation';
import { getNavigationForRole } from './navigation-config';

test('owner sidebar shows live counts including departures outside the mobile dock', () => {
  const html = renderToStaticMarkup(<SidebarNavigation items={getNavigationForRole('owner')} pathname="/overview" attentionCount={7} inspectionCount={3} maintenanceCount={2} departureCount={4} />);
  assert.match(html, /aria-label="Hotel Overview, 7 items need attention"/);
  assert.match(html, /aria-label="Departure due, 4 stays overdue or due within 24 hours"/);
  assert.match(html, /aria-label="Inspections, 3 open inspections"/);
  assert.match(html, /aria-label="Maintenance, 2 open maintenance issues"/);
  assert.equal((html.match(/class="sidebar-attention-badge"/g) ?? []).length, 4);
  assert.match(html, /aria-current="page"/);
});

test('zero and unavailable queues hide badges without inventing attention', () => {
  const html = renderToStaticMarkup(<SidebarNavigation items={getNavigationForRole('owner')} pathname="/rooms" attentionCount={0} inspectionCount={null} maintenanceCount={0} departureCount={null} />);
  assert.doesNotMatch(html, /sidebar-attention-badge/);
  assert.match(html, /href="\/activity"/);
});

test('sidebar counts respect role destinations and display updated supplied values', () => {
  const reception = renderToStaticMarkup(<SidebarNavigation items={getNavigationForRole('receptionist')} pathname="/departure-due" attentionCount={9} inspectionCount={8} maintenanceCount={1} departureCount={5} />);
  assert.doesNotMatch(reception, /href="\/overview"|href="\/inspections"/);
  assert.match(reception, /Maintenance, 1 open maintenance issue/);
  assert.match(reception, /Departure due, 5 stays/);
  const supervisor = renderToStaticMarkup(<SidebarNavigation items={getNavigationForRole('supervisor')} pathname="/inspections" attentionCount={9} inspectionCount={1} maintenanceCount={2} departureCount={5} />);
  assert.doesNotMatch(supervisor, /href="\/departure-due"/);
  assert.match(supervisor, /Inspections, 1 open inspection/);
  assert.match(supervisor, /Maintenance, 2 open maintenance issues/);
});
