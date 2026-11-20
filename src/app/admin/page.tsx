import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/AdminDashboard';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect('/');
  }

  return <AdminDashboard adminEmail={user.email} />;
}
