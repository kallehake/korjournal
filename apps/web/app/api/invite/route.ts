import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, role } = await request.json();

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'E-post krävs' }, { status: 400 });
  }

  // Verify the calling user is authenticated and is admin
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabaseUser
    .from('profiles')
    .select('role, organization_id, organizations(name)')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Endast administratörer kan bjuda in användare' }, { status: 403 });
  }

  // Use admin client to send invite
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const orgName = (profile as any).organizations?.name ?? '';

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login/update-password`,
    data: {
      organization_id: profile.organization_id,
      role: role ?? 'driver',
      invited_by: user.id,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Pre-create profile row so they're linked to the org immediately
  await supabaseAdmin.from('profiles').upsert({
    id: data.user.id,
    email: email,
    full_name: email.split('@')[0],
    organization_id: profile.organization_id,
    role: role ?? 'driver',
  }, { onConflict: 'id' });

  return NextResponse.json({ success: true });
}
