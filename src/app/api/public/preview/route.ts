import { NextRequest, NextResponse } from 'next/server'
import { extractYouTubeId, getPlatformFromUrl, fetchYouTubeMetadata, buildRawText } from '@/lib/youtube'
import { fetchInstagramMetadata, buildInstagramRawText } from '@/lib/instagram'
import { extractPlacesFromText } from '@/lib/anthropic'
import { matchPlaceToGoogle } from '@/lib/google-places'
import { createServiceClient } from '@/lib/supabase/server'
import { logErrorEvent } from '@/lib/error-logger'
import type { ParsedPlace } from '@/types'

function normalizePlaceName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isSameAsHint(name: string, hint?: string) {
  if (!hint) return false
  return normalizePlaceName(name) === normalizePlaceName(hint)
}

function isSpecificPlaceCandidate(place: ParsedPlace) {
  if (!place.raw_name?.trim()) return false
  if (isSameAsHint(place.raw_name, place.city_hint) || isSameAsHint(place.raw_name, place.area_hint)) return false
  if ((place.confidence ?? 0) < 0.6) return false
  return true
}

function dedupeParsedPlaces(places: ParsedPlace[]) {
  const byName = new Map<string, ParsedPlace>()
  for (const place of places.filter(isSpecificPlaceCandidate)) {
    const key = normalizePlaceName(place.raw_name)
    const prev = byName.get(key)
    if (!prev || (place.confidence ?? 0) > (prev.confidence ?? 0)) byName.set(key, place)
  }
  return Array.from(byName.values())
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await mapper(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const url: string = body?.url ?? ''

  if (!url) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })

  const platform = getPlatformFromUrl(url)
  if (!platform) return NextResponse.json({ error: 'YouTube 또는 Instagram URL을 입력해주세요.' }, { status: 400 })

  let rawText: string | undefined
  let title: string | undefined
  let creator: string | undefined
  let thumbnailUrl: string | undefined

  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url)
    if (!videoId) return NextResponse.json({ error: '유효하지 않은 YouTube URL입니다.' }, { status: 400 })

    const meta = await fetchYouTubeMetadata(videoId)
    if (!meta) return NextResponse.json({ error: '영상 정보를 가져오지 못했어요. 비공개 영상이거나 링크가 잘못되었을 수 있어요.' }, { status: 422 })

    title = meta.title
    creator = meta.channelTitle
    thumbnailUrl = meta.thumbnailUrl
    rawText = buildRawText(meta)
  }

  if (platform === 'instagram') {
    try {
      const meta = await fetchInstagramMetadata(url)
      title = meta.title
      creator = meta.creator
      thumbnailUrl = meta.thumbnailUrl
      rawText = buildInstagramRawText(meta)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Instagram 정보를 가져오지 못했습니다.'
      await logErrorEvent({
        feature: 'preview',
        action: 'fetch_instagram_metadata',
        route: '/api/public/preview',
        message,
        error: err,
        metadata: { platform, urlHost: new URL(url).host },
      })
      return NextResponse.json({ error: message }, { status: 422 })
    }
  }

  if (!rawText) return NextResponse.json({ error: '콘텐츠에서 텍스트를 추출하지 못했어요.' }, { status: 422 })

  let parsedPlaces: ParsedPlace[]
  try {
    parsedPlaces = await extractPlacesFromText(rawText)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 분석 중 오류가 발생했어요.'
    await logErrorEvent({
      feature: 'preview',
      action: 'extract_places',
      route: '/api/public/preview',
      message,
      error: err,
      metadata: { platform, urlHost: new URL(url).host, title },
    })
    return NextResponse.json({ error: 'AI 분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  const dedupedPlaces = dedupeParsedPlaces(parsedPlaces)

  const results = await mapWithConcurrency(dedupedPlaces, 3, async (parsed) => {
    const place = await matchPlaceToGoogle(
      parsed.raw_name,
      parsed.city_hint ?? undefined,
      parsed.area_hint ?? undefined,
    ).catch(() => null)
    return {
      rawName: parsed.raw_name,
      category: parsed.category,
      cityHint: parsed.city_hint,
      areaHint: parsed.area_hint,
      evidenceText: parsed.evidence_text,
      confidence: parsed.confidence,
      needsReservation: parsed.needs_reservation ?? false,
      place,
    }
  })

  // 결과를 캐시에 저장 (로그인 후 재추출 방지)
  try {
    const serviceSupabase = await createServiceClient()
    await serviceSupabase.from('url_extraction_cache').upsert(
      {
        url,
        title: title ?? null,
        creator: creator ?? null,
        thumbnail_url: thumbnailUrl ?? null,
        platform,
        places: JSON.stringify(results),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'url' },
    )
  } catch {
    // 캐시 저장 실패는 응답을 막지 않음
  }

  return NextResponse.json({ title, creator, places: results })
}
