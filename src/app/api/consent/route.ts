import { NextRequest, NextResponse } from 'next/server';
import { logLegalConsent } from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      consentType?: 'copyright_upload' | 'privacy_terms';
      termsVersion?: string;
      fileHash?: string | null;
    };

    const user = await getServerSessionUser();
    const consentType =
      body.consentType === 'privacy_terms' ? 'privacy_terms' : 'copyright_upload';

    await logLegalConsent({
      userId: user?.id || null,
      consentType,
      termsVersion: body.termsVersion || 'v1.3',
      fileHash: body.fileHash || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
