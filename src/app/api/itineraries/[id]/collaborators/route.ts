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
  const { data: itinerary, error: itineraryError } = await serviceSupabase
    .from('itineraries')
    .select('id, user_id, visibility')
    .eq('id', id)
    .single()

  if (itineraryError || !itinerary) {
    return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (itinerary.user_id === user.id) {
    return NextResponse.json({ ok: true, role: 'owner' })
  }

  if (itinerary.visibility !== 'public' && itinerary.visibility !== 'link') {
    return NextResponse.json({ error: '공유되지 않은 일정입니다.' }, { status: 403 })
  }

  const { data, error } = await serviceSupabase
    .from('itinerary_collaborators')
    .upsert(
      {
        itinerary_id: id,
        user_id: user.id,
        role: 'editor',
      },
      { onConflict: 'itinerary_id,user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, role: data.role })
}
