import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessSnapshot } from '@/lib/access';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const fileHash = req.nextUrl.searchParams.get('fileHash');
    const user = await getServerSessionUser();
    const snapshot = await resolveUserAccessSnapshot(user, fileHash);

    return NextResponse.json({
      accessLevel: snapshot.access.level,
      freePassStatus: snapshot.freePassStatus,
    });
  } catch {
    return NextResponse.json(
      { error: 'Falha ao consultar status do Passe Gratuito.' },
      { status: 500 }
    );
  }
}
