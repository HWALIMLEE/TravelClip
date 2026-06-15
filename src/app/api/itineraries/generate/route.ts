import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AnthropicApiError, generateItinerary } from '@/lib/anthropic'
import { logErrorEvent } from '@/lib/error-logger'
import { fetchPlaceOpeningSchedule } from '@/lib/google-places'
import {
  addDays,
  buildScheduleNoteForDate,
  getClosedWeekdays,
  getTodayLocalDate,
  WEEKDAY_LABELS,
  type PlaceOpeningSchedule,
} from '@/lib/opening-hours'
import type { GenerateItineraryInput } from '@/types'

interface MockItineraryPlace {
  id: string
  name: string
}

interface CandidatePlace {
  id: string
  google_place_id?: string
  name: string
  category?: string
  lat?: number
  lng?: number
  area?: string
  address?: string
  rating?: number
  review_count?: number
}

const MAX_PLACES_PER_AREA = 8
const MIN_CANDIDATE_LIMIT = 24
const MAX_CANDIDATE_LIMIT = 50

function normalizeLocationText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function placeMatchesRequestedCity(place: { city?: string | null; address?: string | null }, requestedCity: string) {
  const requested = normalizeLocationText(requestedCity)
  if (!requested) return true

  const city = normalizeLocationText(place.city)
  const address = normalizeLocationText(place.address)

  if (!city && !address) return true
  return (
    (!!city && (city.includes(requested) || requested.includes(city))) ||
    (!!address && (address.includes(requested) || requested.includes(address)))
  )
}

function getPlaceScore(place: CandidatePlace) {
  const ratingScore = (place.rating ?? 0) * 100
  const reviewScore = Math.log10((place.review_count ?? 0) + 1) * 30
  return ratingScore + reviewScore
}

function getAreaKey(place: CandidatePlace, fallbackCity: string) {
  const address = place.address ?? ''
  const city = place.area ?? fallbackCity

  const tokyoMatch = address.match(/Tokyo,\s*([^,]+?(?:City|Ward))/i)
  if (tokyoMatch?.[1]) return tokyoMatch[1].trim()

  const koreanDistrictMatch = address.match(/([가-힣]+구|[가-힣]+군|[가-힣]+시)/)
  if (koreanDistrictMatch?.[1]) return koreanDistrictMatch[1].trim()

  const commaParts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (commaParts.length >= 2) return commaParts[commaParts.length - 2]

  return city || '지역 미정'
}

function selectItineraryCandidates(
  places: CandidatePlace[],
  options: { city: string; days: number; mustVisitPlaceIds: string[] }
) {
  const mustVisitIds = new Set(options.mustVisitPlaceIds)
  const totalDays = options.days + 1
  const candidateLimit = Math.min(
    MAX_CANDIDATE_LIMIT,
    Math.max(MIN_CANDIDATE_LIMIT, totalDays * 10, mustVisitIds.size)
  )

  const mustVisitPlaces = places.filter((place) => mustVisitIds.has(place.id))
  const optionalPlaces = places.filter((place) => !mustVisitIds.has(place.id))
  const groups = optionalPlaces.reduce<Record<string, CandidatePlace[]>>((acc, place) => {
    const areaKey = getAreaKey(place, options.city)
    if (!acc[areaKey]) acc[areaKey] = []
    acc[areaKey].push(place)
    return acc
  }, {})

  const popularAreas = Object.entries(groups)
    .map(([area, areaPlaces]) => ({
      area,
      places: areaPlaces.sort((a, b) => getPlaceScore(b) - getPlaceScore(a)),
      score:
        areaPlaces.reduce((sum, place) => sum + getPlaceScore(place), 0) +
        Math.log10(areaPlaces.length + 1) * 50,
    }))
    .sort((a, b) => b.score - a.score)

  const maxAreaCount = Math.min(popularAreas.length, Math.max(totalDays, 3))
  const selected = new Map<string, CandidatePlace>()
  for (const place of mustVisitPlaces) selected.set(place.id, place)

  for (const areaGroup of popularAreas.slice(0, maxAreaCount)) {
    for (const place of areaGroup.places.slice(0, MAX_PLACES_PER_AREA)) {
      if (selected.size >= candidateLimit) break
      selected.set(place.id, { ...place, area: areaGroup.area })
    }
    if (selected.size >= candidateLimit) break
  }

  if (selected.size < Math.min(candidateLimit, places.length)) {
    const leftovers = optionalPlaces
      .filter((place) => !selected.has(place.id))
      .sort((a, b) => getPlaceScore(b) - getPlaceScore(a))

    for (const place of leftovers) {
      if (selected.size >= candidateLimit) break
      selected.set(place.id, { ...place, area: getAreaKey(place, options.city) })
    }
  }

  return Array.from(selected.values())
}

function distanceKm(a: CandidatePlace, b: CandidatePlace) {
  if (!a.lat || !a.lng || !b.lat || !b.lng) return Number.POSITIVE_INFINITY

  const earthRadiusKm = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function orderPlacesByNearestNeighbor<T extends { matchedPlace: CandidatePlace; originalIndex: number }>(items: T[]) {
  if (items.length <= 2) return items

  const withCoordinates = items.filter((item) => item.matchedPlace.lat && item.matchedPlace.lng)
  if (withCoordinates.length <= 2) return items

  const remaining = [...items]
  const start =
    remaining
      .filter((item) => item.matchedPlace.lat && item.matchedPlace.lng)
      .sort((a, b) => {
        const latDiff = (a.matchedPlace.lat ?? 0) - (b.matchedPlace.lat ?? 0)
        if (latDiff !== 0) return latDiff
        return (a.matchedPlace.lng ?? 0) - (b.matchedPlace.lng ?? 0)
      })[0] ?? remaining[0]

  const ordered: T[] = [start]
  remaining.splice(remaining.findIndex((item) => item === start), 1)

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1]
    const next = remaining
      .map((item, index) => ({
        item,
        index,
        distance: distanceKm(current.matchedPlace, item.matchedPlace),
      }))
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.item.originalIndex - b.item.originalIndex
      })[0]

    ordered.push(next.item)
    remaining.splice(next.index, 1)
  }

  return ordered
}

function buildMockItinerary(
  places: MockItineraryPlace[],
  options: { city: string; days: number; travelStyle?: string[] }
) {
  const totalDays = options.days + 1
  const selectedPlaces = places.slice(0, Math.max(totalDays * 2, Math.min(places.length, 8)))
  const itinerary = Array.from({ length: totalDays }, (_, dayIndex) => {
    const dayPlaces = selectedPlaces.filter((_, index) => index % totalDays === dayIndex)
    const fallbackPlace = selectedPlaces[dayIndex % selectedPlaces.length]
    const placesForDay = dayPlaces.length > 0 ? dayPlaces : fallbackPlace ? [fallbackPlace] : []

    return {
      day: dayIndex + 1,
      theme: `${options.city} ${options.travelStyle?.[0] ?? '추천'} 코스`,
      places: placesForDay.map((place, placeIndex) => ({
        place_id: place.id,
        name: place.name,
        time: `${String(10 + placeIndex * 3).padStart(2, '0')}:00`,
        duration_minutes: placeIndex === 0 ? 90 : 75,
        transport_method: placeIndex === 0 ? null : 'train',
        travel_minutes: placeIndex === 0 ? 0 : 20,
      })),
    }
  })

  return {
    title: `${options.city} mock 일정`,
    itinerary,
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as GenerateItineraryInput
  const { city, days, start_date, base_location, travel_style, must_visit_place_ids = [], departure_flight, return_flight } = body

  if (!city || !days) {
    return NextResponse.json({ error: '도시와 여행 기간은 필수입니다.' }, { status: 400 })
  }

  // 사용자 저장 장소 조회
  const { data: savedPlaces, error: savedError } = await supabase
    .from('user_saved_places')
    .select('*, place:places(*)')
    .eq('user_id', user.id)

  if (savedError) {
    await logErrorEvent({
      userId: user.id,
      feature: 'itinerary',
      action: 'load_saved_places',
      route: '/api/itineraries/generate',
      message: savedError.message,
      error: savedError,
      metadata: { city, days },
    })
    return NextResponse.json({ error: savedError.message }, { status: 500 })
  }

  if (!savedPlaces || savedPlaces.length === 0) {
    return NextResponse.json({ error: '저장된 장소가 없습니다. 먼저 장소를 저장해주세요.' }, { status: 400 })
  }

  // 해당 도시의 장소 필터링 (도시 정보가 없으면 전체 포함)
  const relevantPlaces = savedPlaces
    .filter((sp) => {
      const place = sp.place as { id: string; name: string; category?: string; lat?: number; lng?: number; city?: string; address?: string }
      if (!place) return false
      if (must_visit_place_ids.includes(place.id)) return true
      return placeMatchesRequestedCity(place, city)
    })
    .map((sp) => {
      const place = sp.place as {
        id: string
        google_place_id?: string
        name: string
        category?: string
        lat?: number
        lng?: number
        city?: string
        address?: string
        rating?: number
        review_count?: number
      }
      return {
        id: place.id,
        google_place_id: place.google_place_id,
        name: place.name,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        area: place.city,
        address: place.address,
        rating: place.rating,
        review_count: place.review_count,
      }
    })

  if (relevantPlaces.length === 0) {
    return NextResponse.json({ error: '해당 도시에 저장된 장소가 없습니다.' }, { status: 400 })
  }

  try {
    const startDate = start_date ?? getTodayLocalDate()
    const tripDates = Array.from({ length: days + 1 }, (_, index) => addDays(startDate, index))
    const candidatePlaces = selectItineraryCandidates(relevantPlaces, {
      city,
      days,
      mustVisitPlaceIds: must_visit_place_ids,
    })
    const scheduleEntries = await Promise.all(
      candidatePlaces.map(async (place) => {
        const schedule = place.google_place_id
          ? await fetchPlaceOpeningSchedule(place.google_place_id).catch(() => null)
          : null
        return [place.id, schedule] as const
      })
    )
    const schedulesByPlaceId = new Map<string, PlaceOpeningSchedule | null>(scheduleEntries)
    const placesForGeneration = candidatePlaces.map((place) => {
      const schedule = schedulesByPlaceId.get(place.id) ?? undefined
      const closedWeekdays = getClosedWeekdays(schedule ?? undefined)
      const scheduleText =
        closedWeekdays.length > 0
          ? `${closedWeekdays.map((day) => WEEKDAY_LABELS[day]).join(', ')} 휴무`
          : schedule?.hasOpeningHours
            ? 'Google 영업시간 확인됨'
            : 'Google 영업시간 정보 없음'

      return {
        ...place,
        schedule: scheduleText,
      }
    })

    const toFlightConstraint = (f: typeof departure_flight) => f ? {
      flightNum: f.flight_num,
      airlineKorean: f.airline_korean,
      airport: f.airport,
      scheduledTime: f.scheduled_time,
      ioType: f.io_type,
    } : undefined

    const generated = await generateItinerary(placesForGeneration, {
      city,
      days,
      startDate,
      tripDates,
      baseLocation: base_location,
      travelStyle: travel_style,
      departureFlight: toFlightConstraint(departure_flight),
      returnFlight: toFlightConstraint(return_flight),
    })

    if (!generated) {
      await logErrorEvent({
        userId: user.id,
        feature: 'itinerary',
        action: 'generate_ai_itinerary',
        route: '/api/itineraries/generate',
        message: 'AI 일정 생성 결과가 비어 있습니다.',
        metadata: {
          city,
          days,
          candidateCount: candidatePlaces.length,
          mustVisitCount: must_visit_place_ids.length,
        },
      })
      return NextResponse.json({ error: '일정 생성에 실패했습니다.' }, { status: 500 })
    }

    // 시작일/종료일 계산
    const endDate = addDays(startDate, days)

    // itineraries 테이블에 저장
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        user_id: user.id,
        title: generated.title,
        city,
        start_date: startDate,
        end_date: endDate,
        visibility: 'private',
        base_location: base_location ?? null,
      })
      .select()
      .single()

    if (itineraryError || !itinerary) {
      await logErrorEvent({
        userId: user.id,
        feature: 'itinerary',
        action: 'save_itinerary',
        route: '/api/itineraries/generate',
        message: itineraryError?.message ?? '일정 저장에 실패했습니다.',
        error: itineraryError,
        metadata: { city, days, generatedTitle: generated.title },
      })
      return NextResponse.json({ error: '일정 저장에 실패했습니다.' }, { status: 500 })
    }

    // 귀국편이 있고 한국 도착 시각이 15:00 이전이면 마지막 날 관광 불가
    const lastDayWithNoActivities = (() => {
      if (!return_flight) return null
      const { io_type, scheduled_time } = return_flight
      if (io_type !== 'IN') return null
      const [hh] = scheduled_time.split(':').map(Number)
      return hh < 15 ? days + 1 : null
    })()

    // itinerary_items 저장
    const items = []
    const usedPlaceIds = new Set<string>()
    for (const day of generated.itinerary) {
      // 귀국편으로 인해 관광 불가한 날은 아이템 생략
      if (day.day === lastDayWithNoActivities) continue

      const matchedDayPlaces = day.places
        .map((p, index) => {
          const matchedPlace = candidatePlaces.find(
            (rp) => rp.id === p.place_id || rp.name === p.name
          )
          if (!matchedPlace) return null
          return { generatedPlace: p, matchedPlace, originalIndex: index }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .filter((item) => {
          if (usedPlaceIds.has(item.matchedPlace.id)) return false
          usedPlaceIds.add(item.matchedPlace.id)
          return true
        })

      // Claude 출력 시간 기준으로 정렬 후 nearest-neighbor 동선 최적화
      const timeSorted = [...matchedDayPlaces].sort((a, b) => {
        const ta = a.generatedPlace.time ?? '23:59'
        const tb = b.generatedPlace.time ?? '23:59'
        return ta.localeCompare(tb)
      })
      const orderedDayPlaces = orderPlacesByNearestNeighbor(timeSorted)

      // nearest-neighbor 결과를 다시 시간 순으로 재정렬해서 order_index 확정
      const finalOrder = [...orderedDayPlaces].sort((a, b) => {
        const ta = a.generatedPlace.time ?? '23:59'
        const tb = b.generatedPlace.time ?? '23:59'
        return ta.localeCompare(tb)
      })

      for (let i = 0; i < finalOrder.length; i++) {
        const { generatedPlace: p, matchedPlace } = finalOrder[i]
        const previousPlace = finalOrder[i - 1]?.matchedPlace
        const estimatedTravelMinutes = previousPlace
          ? Math.max(5, Math.min(45, Math.round(distanceKm(previousPlace, matchedPlace) * 18)))
          : 0

        items.push({
          itinerary_id: itinerary.id,
          place_id: matchedPlace.id,
          day: day.day,
          order_index: i + 1,
          start_time: p.time ?? null,
          duration_minutes: p.duration_minutes ?? null,
          transport_method: p.transport_method ?? null,
          travel_minutes: estimatedTravelMinutes || (p.travel_minutes ?? null),
        })
      }
    }

    // 항공편 저장
    const flightsToInsert = [
      departure_flight ? { ...departure_flight, itinerary_id: itinerary.id } : null,
      return_flight ? { ...return_flight, itinerary_id: itinerary.id } : null,
    ].filter((f): f is NonNullable<typeof f> => f !== null)
    if (flightsToInsert.length > 0) {
      await supabase.from('itinerary_flights').insert(flightsToInsert)
    }

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('itinerary_items').insert(items)
      if (itemsError) {
        console.error('Items insert error:', itemsError)
        await logErrorEvent({
          userId: user.id,
          feature: 'itinerary',
          action: 'save_itinerary_items',
          route: '/api/itineraries/generate',
          message: itemsError.message,
          error: itemsError,
          metadata: { itineraryId: itinerary.id, itemCount: items.length },
        })
      }
    }

    // 생성된 일정 + 아이템 반환
    const { data: fullItinerary } = await supabase
      .from('itineraries')
      .select('*, items:itinerary_items(*, place:places(*))')
      .eq('id', itinerary.id)
      .single()

    if (fullItinerary?.items) {
      fullItinerary.items = fullItinerary.items.map((item: { day: number; place?: { id?: string } }) => {
        const itemDate = addDays(startDate, item.day - 1)
        const schedule = item.place?.id ? schedulesByPlaceId.get(item.place.id) ?? undefined : undefined
        return {
          ...item,
          schedule_note: buildScheduleNoteForDate(schedule, itemDate, tripDates),
        }
      })
    }

    return NextResponse.json({ id: itinerary.id }, { status: 201 })
  } catch (err) {
    console.error('Generate error:', err)
    await logErrorEvent({
      userId: user.id,
      feature: 'itinerary',
      action: 'generate_itinerary',
      route: '/api/itineraries/generate',
      message: err instanceof Error ? err.message : '일정 생성 중 오류가 발생했습니다.',
      error: err,
      metadata: {
        city,
        days,
        startDate: start_date,
        mustVisitCount: must_visit_place_ids.length,
        provider: 'anthropic',
        status: err instanceof AnthropicApiError ? err.status : undefined,
        type: err instanceof AnthropicApiError ? err.type : undefined,
      },
    })
    return NextResponse.json({ error: '일정 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
