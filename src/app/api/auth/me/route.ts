import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessSnapshot } from '@/lib/access';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const fileHash = req.nextUrl.searchParams.get('fileHash');
    const user = await getServerSessionUser();
    const isDev = user ? isAdminEmail(user.email) : false;

    const {
      access,
      settings,
      activeSubscription,
      activeSingleUnlocks,
      freePassStatus,
    } = await resolveUserAccessSnapshot(user, fileHash);

    return NextResponse.json({
      user,
      isDev,
      access,
      activeSubscription,
      activeSingleUnlocks,
      freePassStatus,
      settings: {
        pricing: settings.pricing,
        paywall: settings.paywall,
        announcement: settings.announcement,
        operations: {
          maintenance_mode: settings.operations.maintenance_mode,
          maintenance_message: settings.operations.maintenance_message,
          monthly_pdf_fair_use_limit: settings.operations.monthly_pdf_fair_use_limit,
        },
        support_links: settings.support_links,
        tutorial: settings.tutorial,
        free_pass: {
          enabled: settings.free_pass.enabled,
          cooldown_days: settings.free_pass.cooldown_days,
          unlock_hours: settings.free_pass.unlock_hours,
          pdf_watermark_enabled: settings.free_pass.pdf_watermark_enabled,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Falha ao carregar informações da conta.' },
      { status: 500 }
    );
  }
}
