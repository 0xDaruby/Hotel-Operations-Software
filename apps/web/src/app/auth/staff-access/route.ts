import { NextResponse } from 'next/server';
import { getStaffProfile } from '@/features/auth/staff-profile';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  try {
    const result = await getStaffProfile();
    return NextResponse.json({ status: result.status }, { headers });
  } catch {
    return NextResponse.json({ error: 'Staff access could not be checked.' }, { status: 503, headers });
  }
}
