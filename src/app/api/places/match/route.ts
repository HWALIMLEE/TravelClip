import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchPlaceToGoogle, searchGooglePlace } from '@/lib/google-places'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { raw_name, city_hint, area_hint } = body as {
    raw_name: string
    city_hint?: string
    area_hint?: string
  }

  if (!raw_name) {
    return NextResponse.json({ error: 'raw_name is required' }, { status: 400 })
  }

  try {
    // 최고 매칭 결과
    const best = await matchPlaceToGoogle(raw_name, city_hint, area_hint)

    // 후보 3개도 반환
    const hint = [area_hint, city_hint].filter(Boolean).join(' ')
    const candidates = await searchGooglePlace(raw_name, hint || undefined)

    return NextResponse.json({ best, candidates: candidates ?? [] })
  } catch (err) {
    console.error('Match error:', err)
    return NextResponse.json({ error: '매칭 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
