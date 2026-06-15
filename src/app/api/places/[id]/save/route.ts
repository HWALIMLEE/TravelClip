import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: placeId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { source_id, note, priority = 0 } = body as {
    source_id?: string
    note?: string
    priority?: number
  }

  // 장소 존재 확인
  const { data: place, error: placeError } = await supabase
    .from('places')
    .select('id')
    .eq('id', placeId)
    .single()

  if (placeError || !place) {
    return NextResponse.json({ error: '장소를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('user_saved_places')
    .upsert(
      {
        user_id: user.id,
        place_id: placeId,
        source_id: source_id ?? null,
        note: note ?? null,
        priority,
      },
      { onConflict: 'user_id,place_id' }
    )
    .select('*, place:places(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
