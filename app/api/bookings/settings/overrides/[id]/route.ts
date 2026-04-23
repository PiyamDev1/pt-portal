import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getRouteSupabaseClient();

    const { error } = await supabase.from('branch_schedule_overrides').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
