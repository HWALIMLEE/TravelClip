import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { FlightInput } from '@/types'

async function getItineraryOwner(serviceSupabase: Awaited<ReturnType<typeof createServiceClient>>, itineraryId: string, userId: string) {
  const { data } = await serviceSupabase
    .from('itineraries')
    .select('user_id, visibility, is_featured')
    .eq('id', itineraryId)
    .single()
  return data
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()
  const itinerary = await getItineraryOwner(serviceSupabase, id, user.id)
  if (!itinerary) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })

  const isOwner = itinerary.user_id === user.id
  const canRead = isOwner || itinerary.visibility === 'public' || itinerary.visibility === 'link' || itinerary.is_featured

  if (!canRead) {
    const { data: collaborator } = await serviceSupabase
      .from('itinerary_collaborators')
      .select('role')
      .eq('itinerary_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!collaborator) return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  const { data, error } = await serviceSupabase
    .from('itinerary_flights')
    .select('*')
    .eq('itinerary_id', id)
    .order('flight_type', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flights: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()
  const itinerary = await getItineraryOwner(serviceSupabase, id, user.id)
  if (!itinerary || itinerary.user_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const body: FlightInput = await req.json()
  const { flight_type, flight_num, airline_korean, airline_english, airport, airport_code, city_code, scheduled_date, scheduled_time, io_type } = body

  if (!flight_type || !flight_num || !scheduled_date || !scheduled_time || !io_type) {
    return NextResponse.json({ error: '필수 항공편 정보가 누락되었습니다.' }, { status: 400 })
  }

  // 같은 타입의 항공편이 이미 있으면 교체
  await serviceSupabase.from('itinerary_flights').delete().eq('itinerary_id', id).eq('flight_type', flight_type)

  const { data, error } = await serviceSupabase
    .from('itinerary_flights')
    .insert({ itinerary_id: id, flight_type, flight_num, airline_korean, airline_english, airport, airport_code, city_code, scheduled_date, scheduled_time, io_type })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flight: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()
  const itinerary = await getItineraryOwner(serviceSupabase, id, user.id)
  if (!itinerary || itinerary.user_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const flightId = req.nextUrl.searchParams.get('flightId')
  if (!flightId) return NextResponse.json({ error: 'flightId가 필요합니다.' }, { status: 400 })

  const { error } = await serviceSupabase
    .from('itinerary_flights')
    .delete()
    .eq('id', flightId)
    .eq('itinerary_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
