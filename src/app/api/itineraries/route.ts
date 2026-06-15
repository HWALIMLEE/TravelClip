import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()

  const { data: owned, error: ownedError } = await serviceSupabase
    .from('itineraries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 })

  const { data: sharedRows, error: sharedError } = await serviceSupabase
    .from('itinerary_collaborators')
    .select('role, itinerary:itineraries(*)')
    .eq('user_id', user.id)

  if (sharedError) return NextResponse.json({ error: sharedError.message }, { status: 500 })

  const ownedItems = (owned ?? []).map((itinerary) => ({
    ...itinerary,
    can_edit: true,
    can_manage_share: true,
    shared_role: 'owner',
  }))
  const sharedItems = (sharedRows ?? [])
    .map((row) => {
      const itinerary = Array.isArray(row.itinerary) ? row.itinerary[0] : row.itinerary
      if (!itinerary) return null
      return {
        ...itinerary,
        can_edit: row.role === 'editor',
        can_manage_share: false,
        shared_role: row.role,
      }
    })
    .filter(Boolean)

  const merged = [...ownedItems, ...sharedItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return NextResponse.json(merged)
}

export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = await createServiceClient()

  const { error } = await serviceSupabase
    .from('itineraries')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: sharedError } = await serviceSupabase
    .from('itinerary_collaborators')
    .delete()
    .eq('user_id', user.id)

  if (sharedError) return NextResponse.json({ error: sharedError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
