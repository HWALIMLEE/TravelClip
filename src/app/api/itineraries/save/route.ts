import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FlightInput } from '@/types'

interface SaveItem {
  place_id: string
  day: number
  order_index: number
  start_time?: string | null
  duration_minutes?: number | null
  transport_method?: string | null
  travel_minutes?: number | null
}

interface SavePayload {
  title: string
  city: string
  start_date: string
  end_date: string
  base_location?: string | null
  items: SaveItem[]
  flights: FlightInput[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as SavePayload
  const { title, city, start_date, end_date, base_location, items, flights } = body

  if (!title || !city || !start_date || !end_date) {
    return NextResponse.json({ error: '필수 데이터가 없습니다.' }, { status: 400 })
  }

  const { data: itinerary, error: itineraryError } = await supabase
    .from('itineraries')
    .insert({
      user_id: user.id,
      title,
      city,
      start_date,
      end_date,
      visibility: 'private',
      base_location: base_location ?? null,
    })
    .select()
    .single()

  if (itineraryError || !itinerary) {
    return NextResponse.json({ error: '일정 저장에 실패했습니다.' }, { status: 500 })
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from('itinerary_items')
      .insert(items.map((item) => ({ ...item, itinerary_id: itinerary.id })))
    if (itemsError) {
      console.error('Items save error:', itemsError)
    }
  }

  if (flights.length > 0) {
    await supabase
      .from('itinerary_flights')
      .insert(flights.map((f) => ({ ...f, itinerary_id: itinerary.id })))
  }

  return NextResponse.json({ id: itinerary.id }, { status: 201 })
}
