import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profileRes, sourcesRes, placesRes, itinerariesRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('sources').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('user_saved_places').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('itineraries').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  return NextResponse.json({
    profile: profileRes.data,
    stats: {
      sources: sourcesRes.count ?? 0,
      saved_places: placesRes.count ?? 0,
      itineraries: itinerariesRes.count ?? 0,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 })

  const { data, error } = await supabase
    .from('users')
    .update({ name: name.trim() })
    .eq('id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
