import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'hwalim9612@gmail.com'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const serviceSupabase = await createServiceClient()

  const updates: Record<string, unknown> = {}
  if (typeof body.is_featured === 'boolean') updates.is_featured = body.is_featured
  if (body.featured_order !== undefined) updates.featured_order = body.featured_order
  if (body.featured_display !== undefined) updates.featured_display = body.featured_display

  const { data, error } = await serviceSupabase
    .from('itineraries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, is_featured, featured_order, featured_display')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
