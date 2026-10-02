const lagosDateTimeFormatter = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatLagosDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : `${lagosDateTimeFormatter.format(date)} WAT`;
}

export function formatElapsedTime(timestamp: string, now: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 60_000));
  if (!Number.isFinite(elapsedMinutes)) return 'Time unavailable';
  if (elapsedMinutes < 1) return 'under 1 min';

  const days = Math.floor(elapsedMinutes / 1440);
  const hours = Math.floor((elapsedMinutes % 1440) / 60);
  const minutes = elapsedMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}