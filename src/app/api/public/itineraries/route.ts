import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('itineraries')
      .select('id, title, city, start_date, end_date, visibility, is_featured, featured_order, featured_display, items:itinerary_items(id)')
      .eq('is_featured', true)
      .order('featured_order', { ascending: true, nullsFirst: false })

    if (error) {
      // featured 컬럼이 아직 없는 경우 빈 배열 반환 (마이그레이션 미적용)
      if (error.message.includes('column') && error.message.includes('is_featured')) {
        return NextResponse.json([])
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = (data ?? []).map((item) => ({
      ...item,
      place_count: Array.isArray(item.items) ? item.items.length : 0,
      items: undefined,
    }))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
