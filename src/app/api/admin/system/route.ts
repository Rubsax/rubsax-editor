import { NextResponse } from 'next/server';
import {
  cleanupMuseScoreTmpDirs,
  getMuseScoreQueueStats,
} from '@/lib/mscore-queue';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const stats = await getMuseScoreQueueStats();
  return NextResponse.json({ stats });
}

export async function POST() {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const beforeStats = await getMuseScoreQueueStats();
  const cleanupResult = await cleanupMuseScoreTmpDirs({
    forceAll: beforeStats.activeRunners === 0,
    maxAgeMinutes: 1,
  });
  const afterStats = await getMuseScoreQueueStats();

  return NextResponse.json({
    ok: true,
    cleanupResult,
    stats: afterStats,
  });
}
