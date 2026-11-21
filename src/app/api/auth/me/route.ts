import { NextRequest, NextResponse } from 'next/server';
import {
  checkUserAccess,
  getUserActiveSingleUnlocks,
  getUserActiveSubscription,
} from '@/lib/access';
import { getAppSettings } from '@/lib/settings';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const fileHash = req.nextUrl.searchParams.get('fileHash');
    const [user, settings] = await Promise.all([
      getServerSessionUser(),
      getAppSettings(),
    ]);

    const access = await checkUserAccess(user, fileHash);
    const isDev = user ? isAdminEmail(user.email) : false;

    const [activeSubscription, activeSingleUnlocks] = user?.id
      ? await Promise.all([
          getUserActiveSubscription(user.id),
          getUserActiveSingleUnlocks(user.id),
        ])
      : [null, []];

    return NextResponse.json({
      user,
      isDev,
      access,
      activeSubscription,
      activeSingleUnlocks,
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
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Falha ao carregar informações da conta.' },
      { status: 500 }
    );
  }
}
