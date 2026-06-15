import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const serviceSupabase = await createServiceClient()
  const { data, error } = await serviceSupabase
    .from('itineraries')
    .select('*')
    .eq('id', id)
    .single()

  const canEdit = !!user && data?.user_id === user.id
  let collaboratorRole: 'viewer' | 'editor' | null = null

  if (user && data?.user_id !== user.id) {
    const { data: collaborator } = await serviceSupabase
      .from('itinerary_collaborators')
      .select('role')
      .eq('itinerary_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    collaboratorRole = collaborator?.role ?? null
  }

  const canEditShared = collaboratorRole === 'editor'
  const canRead = canEdit || canEditShared || collaboratorRole === 'viewer' || data?.visibility === 'public' || data?.visibility === 'link' || data?.is_featured

  if (error || !data || !canRead) {
    return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })
  }

  const [{ data: items, error: itemsError }, { data: flights }] = await Promise.all([
    serviceSupabase
      .from('itinerary_items')
      .select('*, place:places(*)')
      .eq('itinerary_id', id)
      .order('day', { ascending: true })
      .order('order_index', { ascending: true }),
    serviceSupabase
      .from('itinerary_flights')
      .select('*')
      .eq('itinerary_id', id)
      .order('flight_type', { ascending: true }),
  ])

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  return NextResponse.json({
    ...data,
    items: items ?? [],
    flights: flights ?? [],
    can_edit: canEdit || canEditShared,
    can_manage_share: canEdit,
    can_add_to_my_itineraries: !!user && !canEdit && !collaboratorRole,
    shared_role: canEdit ? 'owner' : collaboratorRole,
  })
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

  const body = await request.json()
  const { title, visibility, base_location } = body as {
    title?: string
    visibility?: string
    base_location?: string
  }
  const serviceSupabase = await createServiceClient()
  const { data: itinerary } = await serviceSupabase
    .from('itineraries')
    .select('id, user_id')
    .eq('id', id)
    .single()

  const isOwner = itinerary?.user_id === user.id
  let isEditor = false
  if (!isOwner) {
    const { data: collaborator } = await serviceSupabase
      .from('itinerary_collaborators')
      .select('role')
      .eq('itinerary_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    isEditor = collaborator?.role === 'editor'
  }

  if (!itinerary || (!isOwner && !isEditor)) {
    return NextResponse.json({ error: '일정을 수정할 권한이 없습니다.' }, { status: 403 })
  }

  if (visibility !== undefined && !isOwner) {
    return NextResponse.json({ error: '공유 설정은 일정 소유자만 변경할 수 있습니다.' }, { status: 403 })
  }

  const updates: { title?: string; visibility?: string; base_location?: string } = {}
  if (title !== undefined) updates.title = title
  if (visibility !== undefined) updates.visibility = visibility
  if (base_location !== undefined) updates.base_location = base_location

  const { data, error } = await serviceSupabase
    .from('itineraries')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(
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
  const { data: itinerary } = await serviceSupabase
    .from('itineraries')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!itinerary) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })

  if (itinerary.user_id !== user.id) {
    const { error: leaveError } = await serviceSupabase
      .from('itinerary_collaborators')
      .delete()
      .eq('itinerary_id', id)
      .eq('user_id', user.id)

    if (leaveError) return NextResponse.json({ error: leaveError.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await serviceSupabase
    .from('itineraries')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
