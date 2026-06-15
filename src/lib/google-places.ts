import type { Place } from '@/types'
import { buildGoogleMapsUrl } from '@/lib/maps'
import type { PlaceOpeningSchedule } from '@/lib/opening-hours'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY
const CITY_SEARCH_RADIUS_METERS = 100_000

interface SearchArea {
  lat: number
  lng: number
  region: string
}

interface PlacesSearchResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  types: string[]
  rating?: number
  user_ratings_total?: number
}

interface PlaceDetailsOpeningHours {
  periods?: Array<{ open?: { day?: number; time?: string }; close?: { day?: number; time?: string } }>
  weekday_text?: string[]
}

interface PlaceDetailsResponse {
  result?: {
    opening_hours?: PlaceDetailsOpeningHours
    current_opening_hours?: PlaceDetailsOpeningHours & {
      special_days?: Array<{ date?: string; exceptional_hours?: boolean }>
    }
  }
}

function mapCategory(types: string[]): string {
  if (types.some((t) => ['restaurant', 'food', 'bakery', 'cafe'].includes(t))) return 'restaurant'
  if (types.includes('cafe')) return 'cafe'
  if (types.some((t) => ['lodging', 'hotel'].includes(t))) return 'hotel'
  if (types.some((t) => ['shopping_mall', 'store', 'clothing_store'].includes(t))) return 'shopping'
  if (types.some((t) => ['museum', 'art_gallery'].includes(t))) return 'museum'
  if (types.some((t) => ['park', 'natural_feature'].includes(t))) return 'park'
  if (types.some((t) => ['tourist_attraction', 'point_of_interest'].includes(t))) return 'attraction'
  if (types.some((t) => ['transit_station', 'train_station', 'airport'].includes(t))) return 'transport'
  return 'other'
}

const SEARCH_AREAS: Array<{ aliases: string[]; area: SearchArea }> = [
  { aliases: ['도쿄', 'tokyo'], area: { lat: 35.6762, lng: 139.6503, region: 'jp' } },
  { aliases: ['신주쿠', '시부야', '에비스', '긴자', '니혼바시', '츠키지'], area: { lat: 35.6762, lng: 139.6503, region: 'jp' } },
  { aliases: ['오사카', 'osaka'], area: { lat: 34.6937, lng: 135.5023, region: 'jp' } },
  { aliases: ['교토', 'kyoto'], area: { lat: 35.0116, lng: 135.7681, region: 'jp' } },
  { aliases: ['후쿠오카', 'fukuoka'], area: { lat: 33.5902, lng: 130.4017, region: 'jp' } },
  { aliases: ['삿포로', 'sapporo'], area: { lat: 43.0618, lng: 141.3545, region: 'jp' } },
  { aliases: ['서울', 'seoul'], area: { lat: 37.5665, lng: 126.978, region: 'kr' } },
  { aliases: ['부산', 'busan'], area: { lat: 35.1796, lng: 129.0756, region: 'kr' } },
  { aliases: ['제주', 'jeju'], area: { lat: 33.4996, lng: 126.5312, region: 'kr' } },
]

function resolveSearchArea(text?: string): SearchArea | undefined {
  if (!text) return undefined
  const normalized = text.toLowerCase()
  return SEARCH_AREAS.find(({ aliases }) =>
    aliases.some((alias) => normalized.includes(alias.toLowerCase()))
  )?.area
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusMeters = 6_371_000
  const toRadians = (degree: number) => (degree * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export async function searchGooglePlace(
  query: string,
  cityHint?: string
): Promise<PlacesSearchResult[] | null> {
  if (!API_KEY) return null

  const searchArea = resolveSearchArea(cityHint)
  const searchQuery = cityHint ? `${query} ${cityHint}` : query
  const params = new URLSearchParams({
    query: searchQuery,
    key: API_KEY,
    language: 'ko',
  })
  if (searchArea) {
    params.set('location', `${searchArea.lat},${searchArea.lng}`)
    params.set('radius', String(CITY_SEARCH_RADIUS_METERS))
    params.set('region', searchArea.region)
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
  )
  if (!res.ok) return null

  const data = await res.json()
  const results = (data.results ?? []) as PlacesSearchResult[]
  const filteredResults = searchArea
    ? results.filter((result) => {
        const distance = distanceMeters(searchArea, result.geometry.location)
        return distance <= CITY_SEARCH_RADIUS_METERS
      })
    : results

  return filteredResults.slice(0, 3)
}

export async function matchPlaceToGoogle(
  rawName: string,
  cityHint?: string,
  areaHint?: string
): Promise<Place | null> {
  const hint = [areaHint, cityHint].filter(Boolean).join(' ')
  const results = await searchGooglePlace(rawName, hint)
  if (!results || results.length === 0) return null

  const best = results[0]
  const addressParts = best.formatted_address.split(',')
  const country = addressParts[addressParts.length - 1]?.trim()
  const city = cityHint ?? addressParts[addressParts.length - 2]?.trim()

  const place: Place = {
    id: '',
    google_place_id: best.place_id,
    name: best.name,
    address: best.formatted_address,
    lat: best.geometry.location.lat,
    lng: best.geometry.location.lng,
    city,
    country,
    category: mapCategory(best.types),
    rating: best.rating,
    review_count: best.user_ratings_total,
  }

  return {
    ...place,
    maps_url: buildGoogleMapsUrl(place),
  }
}

export async function fetchPlaceOpeningSchedule(
  googlePlaceId: string
): Promise<PlaceOpeningSchedule | null> {
  if (!API_KEY || !googlePlaceId) return null

  const params = new URLSearchParams({
    place_id: googlePlaceId,
    fields: 'opening_hours,current_opening_hours',
    language: 'ko',
    key: API_KEY,
  })

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)
  if (!res.ok) return null

  const data = (await res.json()) as PlaceDetailsResponse
  const openingHours = data.result?.current_opening_hours ?? data.result?.opening_hours
  if (!openingHours) {
    return { hasOpeningHours: false }
  }

  const openWeekdays = Array.from(
    new Set(
      openingHours.periods
        ?.map((period) => period.open?.day)
        .filter((day): day is number => typeof day === 'number') ?? []
    )
  )

  return {
    weekdayText: openingHours.weekday_text,
    openWeekdays,
    hasOpeningHours: openWeekdays.length > 0 || !!openingHours.weekday_text?.length,
  }
}
