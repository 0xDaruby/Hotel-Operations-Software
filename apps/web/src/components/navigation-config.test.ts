import test from 'node:test';
import assert from 'node:assert/strict';

import { getDockAttentionBadgeCount, getDockBadgeRequirements, getDockNavigation } from './navigation-config';

test('Owner mobile dock preserves its original destinations and overflow', () => {
  const { docked, overflow } = getDockNavigation('owner');
  assert.deepEqual(docked.map((item) => item.href), [
    '/overview',
    '/stays',
    '/inspections',
    '/maintenance',
    '/payments',
  ]);
  assert.deepEqual(docked.map((item) => item.shortLabel), ['Overview', 'Stays', 'Inspect', 'Fix-It', 'Pay']);
  assert.deepEqual(overflow.map((item) => item.href), ['/rooms', '/departure-due', '/activity', '/staff']);
});

test('non-owner mobile dock destinations remain unchanged', () => {
  assert.deepEqual(getDockNavigation('receptionist').docked.map((item) => item.href), [
    '/rooms', '/stays', '/departure-due', '/maintenance', '/activity',
  ]);
  assert.deepEqual(getDockNavigation('supervisor').docked.map((item) => item.href), [
    '/rooms', '/inspections', '/maintenance', '/activity',
  ]);
});

test('badge counts are loaded for every role with the corresponding dock destination', () => {
  assert.deepEqual(getDockBadgeRequirements('owner'), { overview: true, inspections: true, maintenance: true });
  assert.deepEqual(getDockBadgeRequirements('receptionist'), { overview: false, inspections: false, maintenance: true });
  assert.deepEqual(getDockBadgeRequirements('supervisor'), { overview: false, inspections: true, maintenance: true });
});

test('attention count badge is attached only to the Overview dock destination', () => {
  assert.equal(getDockAttentionBadgeCount('/overview', 4), 4);
  assert.equal(getDockAttentionBadgeCount('/overview', 0), null);
  assert.equal(getDockAttentionBadgeCount('/stays', 4), null);
  assert.equal(getDockAttentionBadgeCount('/rooms', 4), null);
});

test('inspection badge uses its supplied count and leaves the owner destination unchanged', () => {
  assert.equal(getDockAttentionBadgeCount('/inspections', 4, 3), 3);
  assert.equal(getDockAttentionBadgeCount('/inspections', 4, 0), null);
  assert.equal(getDockAttentionBadgeCount('/inspections', 4), null);
  assert.equal(getDockAttentionBadgeCount('/overview', 4, 3), 4);
});

test('maintenance badge uses its supplied count without affecting other dock destinations', () => {
  assert.equal(getDockAttentionBadgeCount('/maintenance', 4, 3, 2), 2);
  assert.equal(getDockAttentionBadgeCount('/maintenance', 4, 3, 0), null);
  assert.equal(getDockAttentionBadgeCount('/maintenance', 4, 3), null);
  assert.equal(getDockAttentionBadgeCount('/inspections', 4, 3, 2), 3);
});