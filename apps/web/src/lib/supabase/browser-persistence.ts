'use client';

import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { REMEMBER_COOKIE, rememberCookieOptions } from './session-persistence';

export function readBrowserCookies() {
  return parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? '' }));
}

export function rememberBrowserSession() {
  return readBrowserCookies().find(cookie => cookie.name === REMEMBER_COOKIE)?.value === 'yes';
}

export function setRememberBrowserSession(remembered: boolean) {
  document.cookie = serializeCookieHeader(REMEMBER_COOKIE, remembered ? 'yes' : 'no', {
    ...rememberCookieOptions(remembered), secure: window.location.protocol === 'https:',
  });
  const saved = readBrowserCookies().find(cookie => cookie.name === REMEMBER_COOKIE)?.value;
  if (saved !== (remembered ? 'yes' : 'no')) throw new Error('Browser session preference could not be saved.');
}
