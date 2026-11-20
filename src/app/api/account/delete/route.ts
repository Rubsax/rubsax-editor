import { NextRequest, NextResponse } from 'next/server';
import {
  admin,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import {
  clearAuthCookiesOnResponse,
  getServerSessionUser,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getServerSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Você precisa estar logado para excluir sua conta.' },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
    if (!body.confirm) {
      return NextResponse.json(
        { error: 'Confirmação explícita obrigatória para excluir a conta.' },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      const nowIso = new Date().toISOString();

      // 1. Marca deleted_at e anonimiza dados pessoais em profiles
      await supabaseAdminFetch(
        `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            deleted_at: nowIso,
            email: `deleted-${user.id}@anon.rubsax`,
            full_name: 'Usuário Excluído (LGPD)',
            avatar_url: null,
          }),
        }
      ).catch(() => {});

      // 2. Cancela assinaturas ativas vinculadas ao usuário
      await supabaseAdminFetch(
        `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(
          user.id
        )}&status=eq.active`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'cancelled',
            cancel_at_period_end: true,
            updated_at: nowIso,
          }),
        }
      ).catch(() => {});

      // 3. Remove usuário do Supabase Auth via Admin API
      const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
      if (deleteErr) {
        return NextResponse.json(
          { error: `Erro ao remover usuário do provedor de autenticação: ${deleteErr}` },
          { status: 500 }
        );
      }
    }

    const res = NextResponse.json({
      ok: true,
      message: 'Sua conta e seus dados pessoais foram excluídos conforme a LGPD.',
    });
    clearAuthCookiesOnResponse(res);
    return res;
  } catch {
    return NextResponse.json(
      { error: 'Falha ao excluir conta. Tente novamente.' },
      { status: 500 }
    );
  }
}
