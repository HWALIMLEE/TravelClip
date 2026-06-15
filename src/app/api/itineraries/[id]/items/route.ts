import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface ItemUpdate {
  id: string
  day: number
  order_index: number
  start_time?: string | null
  duration_minutes?: number | null
  transport_method?: string | null
  travel_minutes?: number | null
}

async function getEditableItinerary(id: string, userId: string) {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('itineraries')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (error || !data) return null
  if (data.user_id === userId) return data

  const { data: collaborator } = await supabase
    .from('itinerary_collaborators')
    .select('role')
    .eq('itinerary_id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (collaborator?.role !== 'editor') return null
  return data
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itinerary = await getEditableItinerary(id, user.id)
  if (!itinerary) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })

  const body = await request.json()
  const { place_id, day } = body as { place_id?: string; day?: number }

  if (!place_id || !day || day < 1) {
    return NextResponse.json({ error: '추가할 장소와 일차를 선택해주세요.' }, { status: 400 })
  }

  const { data: savedPlace } = await supabase
    .from('user_saved_places')
    .select('place_id')
    .eq('user_id', user.id)
    .eq('place_id', place_id)
    .single()

  if (!savedPlace) {
    return NextResponse.json({ error: '내 지도에 저장된 장소만 일정에 추가할 수 있습니다.' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()
  const { data: lastItem } = await serviceSupabase
    .from('itinerary_items')
    .select('order_index')
    .eq('itinerary_id', id)
    .eq('day', day)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await serviceSupabase
    .from('itinerary_items')
    .insert({
      itinerary_id: id,
      place_id,
      day,
      order_index: (lastItem?.order_index ?? 0) + 1,
      duration_minutes: 90,
      transport_method: 'walk',
      travel_minutes: 0,
    })
    .select('*, place:places(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itinerary = await getEditableItinerary(id, user.id)
  if (!itinerary) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })

  const body = await request.json()
  const { items } = body as { items?: ItemUpdate[] }
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: '수정할 일정 항목이 없습니다.' }, { status: 400 })
  }

  for (const item of items) {
    if (!item.id || !item.day || !item.order_index) {
      return NextResponse.json({ error: '일정 항목 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const serviceSupabase = await createServiceClient()
    const { error } = await serviceSupabase
      .from('itinerary_items')
      .update({
        day: item.day,
        order_index: item.order_index,
        start_time: item.start_time || null,
        duration_minutes: item.duration_minutes ?? null,
        transport_method: item.transport_method || null,
        travel_minutes: item.travel_minutes ?? null,
      })
      .eq('id', item.id)
      .eq('itinerary_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
