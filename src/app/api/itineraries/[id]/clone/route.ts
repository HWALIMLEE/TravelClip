import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()

  const { data: original, error: fetchError } = await serviceSupabase
    .from('itineraries')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })
  }

  const canRead =
    original.visibility === 'public' ||
    original.visibility === 'link' ||
    original.is_featured ||
    original.user_id === user.id

  if (!canRead) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  const { data: newItinerary, error: insertError } = await serviceSupabase
    .from('itineraries')
    .insert({
      user_id: user.id,
      title: `${original.title} (복제)`,
      city: original.city,
      start_date: original.start_date,
      end_date: original.end_date,
      visibility: 'private',
      base_location: original.base_location,
    })
    .select()
    .single()

  if (insertError || !newItinerary) {
    return NextResponse.json({ error: '일정을 복제하지 못했습니다.' }, { status: 500 })
  }

  const { data: items } = await serviceSupabase
    .from('itinerary_items')
    .select('place_id, day, order_index, start_time, duration_minutes, transport_method, travel_minutes')
    .eq('itinerary_id', id)

  if (items && items.length > 0) {
    await serviceSupabase
      .from('itinerary_items')
      .insert(items.map((item) => ({ ...item, itinerary_id: newItinerary.id })))
  }

  return NextResponse.json({ id: newItinerary.id })
}
