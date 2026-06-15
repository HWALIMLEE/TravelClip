import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function canEditItinerary(id: string, userId: string) {
  const supabase = await createServiceClient()
  const { data: itinerary } = await supabase
    .from('itineraries')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!itinerary) return false
  if (itinerary.user_id === userId) return true

  const { data: collaborator } = await supabase
    .from('itinerary_collaborators')
    .select('role')
    .eq('itinerary_id', id)
    .eq('user_id', userId)
    .maybeSingle()

  return collaborator?.role === 'editor'
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const editable = await canEditItinerary(id, user.id)
  if (!editable) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })

  const serviceSupabase = await createServiceClient()
  const { error } = await serviceSupabase
    .from('itinerary_items')
    .delete()
    .eq('id', itemId)
    .eq('itinerary_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
