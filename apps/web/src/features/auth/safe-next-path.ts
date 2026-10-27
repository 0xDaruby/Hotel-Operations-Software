const destinations = new Set([
  '/', '/overview', '/rooms', '/stays', '/departure-due', '/inspections',
  '/maintenance', '/payments', '/activity', '/staff', '/set-password',
]);

/** Only known application pages can be a post-login destination. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return '/overview';
  try {
    const target = new URL(value, 'https://internal.invalid');
    if (target.origin !== 'https://internal.invalid' || !destinations.has(target.pathname)) return '/overview';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/overview';
  }
}
