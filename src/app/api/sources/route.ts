import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { extractYouTubeId, getPlatformFromUrl, fetchYouTubeMetadata, buildRawText } from '@/lib/youtube'
import { fetchInstagramMetadata, buildInstagramRawText } from '@/lib/instagram'
import { logErrorEvent } from '@/lib/error-logger'

type CachedPlace = {
  rawName: string
  category?: string
  cityHint?: string
  areaHint?: string
  evidenceText?: string
  confidence?: number
  needsReservation?: boolean
  place: {
    google_place_id: string
    name: string
    address?: string
    lat?: number
    lng?: number
    city?: string
    country?: string
    category?: string
    rating?: number
    review_count?: number
    maps_url?: string
  } | null
}

async function createSourceFromCachedPlaces(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceSupabase: Awaited<ReturnType<typeof createServiceClient>>,
  opts: {
    userId: string
    platform: string
    url: string
    title?: string | null
    creator?: string | null
    thumbnailUrl?: string | null
    cachedPlaces: CachedPlace[]
  },
) {
  const { userId, platform, url, title, creator, thumbnailUrl, cachedPlaces } = opts

  const { data: newSource, error: sourceError } = await supabase
    .from('sources')
    .insert({ user_id: userId, platform, url, title, creator, thumbnail_url: thumbnailUrl ?? null, status: 'parsed' })
    .select()
    .single()

  if (sourceError || !newSource) return null

  const extractedRows = await Promise.all(
    cachedPlaces.map(async (cp) => {
      let placeId: string | null = null
      if (cp.place?.google_place_id) {
        const { data: upserted } = await serviceSupabase
          .from('places')
          .upsert(
            {
              google_place_id: cp.place.google_place_id,
              name: cp.place.name,
              address: cp.place.address,
              lat: cp.place.lat,
              lng: cp.place.lng,
              city: cp.place.city,
              country: cp.place.country,
              category: cp.place.category,
              rating: cp.place.rating,
              review_count: cp.place.review_count,
              maps_url: cp.place.maps_url,
            },
            { onConflict: 'google_place_id' },
          )
          .select('id')
          .single()
        placeId = upserted?.id ?? null
      }
      return {
        source_id: newSource.id,
        raw_name: cp.rawName,
        category: cp.category ?? null,
        city_hint: cp.cityHint ?? null,
        area_hint: cp.areaHint ?? null,
        evidence_text: cp.evidenceText ?? null,
        confidence: cp.confidence ?? null,
        needs_reservation: cp.needsReservation ?? false,
        place_id: placeId,
        status: placeId ? 'matched' : 'pending',
      }
    }),
  )

  await serviceSupabase.from('extracted_places').insert(extractedRows)

  return newSource
}

function debugLog(label: string, data: unknown) {
  console.log(`${label} ${JSON.stringify(data, null, 2)}`)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = await request.json()
  if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

  const platform = getPlatformFromUrl(url)
  if (!platform) return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })

  // 같은 URL이 이미 존재하면 기존 source 반환 (API 중복 호출 방지)
  const { data: existingSource } = await supabase
    .from('sources')
    .select('*')
    .eq('user_id', user.id)
    .eq('url', url)
    .neq('status', 'failed')
    .maybeSingle()

  if (existingSource) {
    return NextResponse.json(
      { ...existingSource, from_cache: existingSource.status === 'parsed' },
      { status: 200 },
    )
  }

  const serviceSupabase = await createServiceClient()

  // 비로그인 미리보기 캐시 확인: 동일 URL을 이미 추출한 적 있으면 재추출 생략
  const { data: urlCache } = await serviceSupabase
    .from('url_extraction_cache')
    .select('*')
    .eq('url', url)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (urlCache) {
    const cachedPlaces = (
      typeof urlCache.places === 'string' ? JSON.parse(urlCache.places) : urlCache.places
    ) as CachedPlace[]
    const newSource = await createSourceFromCachedPlaces(supabase, serviceSupabase, {
      userId: user.id,
      platform,
      url,
      title: urlCache.title,
      creator: urlCache.creator,
      thumbnailUrl: urlCache.thumbnail_url,
      cachedPlaces,
    })
    if (newSource) {
      return NextResponse.json({ ...newSource, from_cache: true }, { status: 201 })
    }
  }

  // 다른 사용자가 동일 URL을 이미 추출한 경우 그 결과를 복사
  const { data: otherSource } = await serviceSupabase
    .from('sources')
    .select('id, title, creator, thumbnail_url, platform')
    .eq('url', url)
    .eq('status', 'parsed')
    .neq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (otherSource) {
    const { data: otherPlaces } = await serviceSupabase
      .from('extracted_places')
      .select('*, place:places(*)')
      .eq('source_id', otherSource.id)

    const cachedPlaces: CachedPlace[] = (otherPlaces ?? []).map((ep) => ({
      rawName: ep.raw_name,
      category: ep.category ?? undefined,
      cityHint: ep.city_hint ?? undefined,
      areaHint: ep.area_hint ?? undefined,
      evidenceText: ep.evidence_text ?? undefined,
      confidence: ep.confidence ?? undefined,
      needsReservation: ep.needs_reservation ?? false,
      place: ep.place ?? null,
    }))

    const newSource = await createSourceFromCachedPlaces(supabase, serviceSupabase, {
      userId: user.id,
      platform,
      url,
      title: otherSource.title,
      creator: otherSource.creator,
      thumbnailUrl: otherSource.thumbnail_url,
      cachedPlaces,
    })
    if (newSource) {
      return NextResponse.json({ ...newSource, from_cache: true }, { status: 201 })
    }
  }

  let title: string | undefined
  let creator: string | undefined
  let thumbnailUrl: string | undefined
  let rawText: string | undefined
  let debug: unknown

  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url)
    if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

    const meta = await fetchYouTubeMetadata(videoId)
    if (meta) {
      title = meta.title
      creator = meta.channelTitle
      thumbnailUrl = meta.thumbnailUrl
      rawText = buildRawText(meta)
      debug = {
        videoId,
        title,
        creator,
        creatorCommentCount: meta.creatorComments?.length ?? 0,
        creatorComments: meta.creatorComments ?? [],
        rawText,
      }

      debugLog('[sources] youtube metadata text prepared', debug)
    }
  }

  if (platform === 'instagram') {
    try {
      const meta = await fetchInstagramMetadata(url)
      title = meta.title
      creator = meta.creator
      thumbnailUrl = meta.thumbnailUrl
      rawText = buildInstagramRawText(meta)
      debug = {
        title,
        creator,
        commentCount: meta.comments.length,
        mediaUrlCount: meta.mediaUrls.length,
        rawText,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Instagram 정보를 가져오지 못했습니다.'
      await logErrorEvent({
        userId: user.id,
        feature: 'sources',
        action: 'fetch_instagram_metadata',
        route: '/api/sources',
        message,
        error,
        metadata: { platform, urlHost: new URL(url).host },
      })
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Instagram CDN URL을 임시로 저장하고, source 생성 후 Edge Function으로 Storage에 이전
  const { data, error } = await supabase
    .from('sources')
    .insert({
      user_id: user.id,
      platform,
      url,
      title,
      creator,
      thumbnail_url: thumbnailUrl,
      raw_text: rawText,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    await logErrorEvent({
      userId: user.id,
      feature: 'sources',
      action: 'create_source',
      route: '/api/sources',
      message: error.message,
      error,
      metadata: { platform, urlHost: new URL(url).host },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Instagram 썸네일: Cloudflare에서 직접 접근 불가 → Edge Function(Deno)에 위임
  if (platform === 'instagram' && thumbnailUrl && data?.id) {
    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/store-thumbnail`
    try {
      await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ imageUrl: thumbnailUrl, sourceId: data.id }),
      })
    } catch {
      // 썸네일 저장 실패는 콘텐츠 저장 자체를 막지 않음
    }
  }

  return NextResponse.json({ ...data, debug }, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('sources')
    .select('*, extracted_places(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? []).map((s) => ({
    ...s,
    extracted_place_count: (s.extracted_places as unknown as { count: number }[])?.[0]?.count ?? 0,
    extracted_places: undefined,
  }))

  return NextResponse.json(result)
}
