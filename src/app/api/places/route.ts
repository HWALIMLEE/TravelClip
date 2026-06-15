import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { matchPlaceToGoogle } from '@/lib/google-places'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_saved_places')
    .select('*, place:places(*), source:sources(id, platform, title, creator, url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('user_saved_places')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const serviceSupabase = await createServiceClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, city_hint, area_hint } = body as {
    name?: string
    city_hint?: string
    area_hint?: string
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: '장소명을 입력해주세요.' }, { status: 400 })
  }

  const matched = await matchPlaceToGoogle(name.trim(), city_hint?.trim(), area_hint?.trim())
  if (!matched) {
    return NextResponse.json({ error: 'Google Maps에서 장소를 찾지 못했습니다.' }, { status: 404 })
  }

  const { data: place, error: placeError } = await serviceSupabase
    .from('places')
    .upsert(
      {
        google_place_id: matched.google_place_id,
        name: matched.name,
        address: matched.address,
        lat: matched.lat,
        lng: matched.lng,
        city: matched.city,
        country: matched.country,
        category: matched.category,
        rating: matched.rating,
        review_count: matched.review_count,
        maps_url: matched.maps_url,
      },
      { onConflict: 'google_place_id' }
    )
    .select('*')
    .single()

  if (placeError || !place) {
    return NextResponse.json({ error: placeError?.message ?? '장소 저장에 실패했습니다.' }, { status: 500 })
  }

  const { data: savedPlace, error: saveError } = await supabase
    .from('user_saved_places')
    .upsert(
      {
        user_id: user.id,
        place_id: place.id,
        source_id: null,
        note: null,
        priority: 0,
      },
      { onConflict: 'user_id,place_id' }
    )
    .select('*, place:places(*)')
    .single()

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 })
  }

  return NextResponse.json(savedPlace, { status: 201 })
}
