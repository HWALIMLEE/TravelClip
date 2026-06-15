import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (sourceError || !source) {
    return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: extractedPlaces, error: placesError } = await supabase
    .from('extracted_places')
    .select('*, place:places(*)')
    .eq('source_id', id)
    .order('confidence', { ascending: false })

  if (placesError) {
    return NextResponse.json({ error: placesError.message }, { status: 500 })
  }

  return NextResponse.json({ source, extractedPlaces: extractedPlaces ?? [] })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
