import type { Place } from '@/types'

export function getCoordinates(place: Place): { lat: number; lng: number } | undefined {
  const lat = Number(place.lat)
  const lng = Number(place.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return { lat, lng }
}

export function hasCoordinates(place: Place): place is Place & { lat: number; lng: number } {
  return !!getCoordinates(place)
}

export function buildGoogleMapsUrl(place: Place): string | undefined {
  const params = new URLSearchParams({ api: '1' })

  // query는 반드시 텍스트 장소명이어야 모바일 앱에서 정상 동작
  // 좌표를 query에 넣으면 모바일 Maps 앱이 place_id: 형식으로 처리해 검색 실패함
  const query = [place.name, place.address].filter(Boolean).join(' ')
  if (!query) {
    if (hasCoordinates(place)) {
      const coordinates = getCoordinates(place)!
      params.set('query', `${coordinates.lat},${coordinates.lng}`)
    } else {
      return place.maps_url
    }
  } else {
    params.set('query', query)
  }

  if (place.google_place_id) {
    params.set('query_place_id', place.google_place_id)
  }

  return `https://www.google.com/maps/search/?${params.toString()}`
}
