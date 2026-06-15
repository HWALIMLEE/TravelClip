import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'hwalim9612@gmail.com'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceSupabase = await createServiceClient()

  const { data, error } = await serviceSupabase
    .from('itineraries')
    .select('id, title, city, start_date, end_date, visibility, is_featured, featured_order, featured_display, items:itinerary_items(id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? []).map((item) => ({
    ...item,
    place_count: Array.isArray(item.items) ? item.items.length : 0,
    items: undefined,
  }))

  return NextResponse.json(result)
}
