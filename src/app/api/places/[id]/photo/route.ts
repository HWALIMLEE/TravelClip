import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: placeId } = await params
  const reference = request.nextUrl.searchParams.get('reference')
  const maxWidth = request.nextUrl.searchParams.get('maxwidth') ?? '720'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!reference || !GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: '사진 정보를 불러올 수 없습니다.' }, { status: 400 })
  }

  const { data: savedPlace } = await supabase
    .from('user_saved_places')
    .select('id')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .single()

  if (!savedPlace) {
    return NextResponse.json({ error: '장소를 찾을 수 없습니다.' }, { status: 404 })
  }

  const query = new URLSearchParams({
    photoreference: reference,
    maxwidth: maxWidth,
    key: GOOGLE_PLACES_API_KEY,
  })
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/photo?${query}`)

  if (!response.ok) {
    return NextResponse.json({ error: '사진을 불러오지 못했습니다.' }, { status: 502 })
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=21600',
    },
  })
}
