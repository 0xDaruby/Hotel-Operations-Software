import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BellDotIcon,
  Home04Icon,
  Hotel02Icon,
  HourglassOffIcon,
  RepairIcon,
  TaskDaily02Icon,
  UserListIcon,
  UserCheck01Icon,
  Wallet02Icon,
} from './index';

const icons = [
  BellDotIcon,
  Home04Icon,
  Hotel02Icon,
  HourglassOffIcon,
  RepairIcon,
  TaskDaily02Icon,
  UserListIcon,
  UserCheck01Icon,
  Wallet02Icon,
];

test('shared hotel icons expose the normalized SVG contract', () => {
  for (const Icon of icons) {
    const markup = renderToStaticMarkup(createElement(Icon));
    assert.match(markup, /width="24"/);
    assert.match(markup, /height="24"/);
    assert.match(markup, /viewBox="0 0 24 24"/);
    assert.match(markup, /stroke="currentColor"/);
    assert.match(markup, /stroke-width="1\.5"/);
    assert.match(markup, /stroke-linecap="round"/);
    assert.match(markup, /stroke-linejoin="round"/);
    assert.doesNotMatch(markup, /stroke="#[0-9a-f]+"/i);
  }
});

test('shared hotel icons allow callers to override size and SVG props', () => {
  const markup = renderToStaticMarkup(createElement(Home04Icon, { size: 16, 'aria-label': 'Overview' }));
  assert.match(markup, /width="16"/);
  assert.match(markup, /height="16"/);
  assert.match(markup, /aria-label="Overview"/);
});
