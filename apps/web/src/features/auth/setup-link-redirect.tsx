'use client';

import { useEffect } from 'react';
import { hasStaffSetupResponse } from './setup-link';

/** Handle Auth's Site URL fallback whether the browser was signed in or signed out. */
export function SetupLinkRedirect() {
  useEffect(() => {
    if (window.location.pathname !== '/auth/complete' && hasStaffSetupResponse(window.location.hash)) {
      window.location.replace(`/auth/complete${window.location.hash}`);
    }
  }, []);
  return null;
}
