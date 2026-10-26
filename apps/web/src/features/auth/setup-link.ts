/** Only staff invitation and legacy setup-recovery links may establish setup sessions. */
export function isStaffSetupType(type: string | null): type is 'invite' | 'recovery' {
  return type === 'invite' || type === 'recovery';
}

export function staffSetupFragment(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const type = params.get('type');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!isStaffSetupType(type) || !accessToken || !refreshToken) return null;
  return { access_token: accessToken, refresh_token: refreshToken };
}

export function hasStaffSetupResponse(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return Boolean(staffSetupFragment(hash)) || params.get('error_code') === 'otp_expired';
}
