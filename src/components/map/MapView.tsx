'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { Place } from '@/types'
import { buildGoogleMapsUrl, getCoordinates } from '@/lib/maps'

interface MapViewProps {
  places: Place[]
  selectedPlaceId?: string
  markerLabels?: Record<string, string>
  onPlaceClick?: (place: Place) => void
  height?: string
  bottomOffset?: number // 하단 UI(시트/카드)가 덮는 px — 마커를 보이는 영역 중앙에 맞추는 데 사용
}

declare global {
  interface Window {
    google: typeof google
    initGoogleMap?: () => void
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: '맛집',
  cafe: '카페',
  attraction: '관광지',
  shopping: '쇼핑',
  museum: '박물관',
  park: '공원',
  hotel: '숙소',
  transport: '교통',
  other: '기타',
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default function MapView({
  places,
  selectedPlaceId,
  markerLabels,
  onPlaceClick,
  height = '100%',
  bottomOffset = 0,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const infoWindowsRef = useRef<Map<string, google.maps.InfoWindow>>(new Map())
  const bottomOffsetRef = useRef(bottomOffset)
  const selectedPlaceIdRef = useRef(selectedPlaceId)
  const normalizedPlacesRef = useRef<Array<Place & { lat: number; lng: number }>>([])
  const markerLabelsRef = useRef(markerLabels)
  const onPlaceClickRef = useRef(onPlaceClick)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => { bottomOffsetRef.current = bottomOffset }, [bottomOffset])
  useEffect(() => { selectedPlaceIdRef.current = selectedPlaceId }, [selectedPlaceId])
  useEffect(() => { markerLabelsRef.current = markerLabels }, [markerLabels])
  useEffect(() => { onPlaceClickRef.current = onPlaceClick }, [onPlaceClick])
  const [loadError, setLoadError] = useState(() => !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

  const normalizedPlaces = useMemo(
    () =>
      places
        .map((place) => {
          const coordinates = getCoordinates(place)
          return coordinates ? { ...place, ...coordinates } : undefined
        })
        .filter((place): place is Place & { lat: number; lng: number } => !!place),
    [places]
  )
  useEffect(() => { normalizedPlacesRef.current = normalizedPlaces }, [normalizedPlaces])
  const placesKey = normalizedPlaces
    .map((place) => `${place.id}:${place.lat ?? ''}:${place.lng ?? ''}`)
    .join('|')
  const markerLabelsKey = Object.entries(markerLabels ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([placeId, label]) => `${placeId}:${label}`)
    .join('|')

  const getMarkerIcon = useCallback((placeId: string, activePlaceId?: string) => {
    const hasLabel = !!markerLabelsRef.current?.[placeId]
    const isSelected = placeId === activePlaceId

    if (hasLabel) {
      return {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 16 : 13,
        fillColor: isSelected ? '#DC2626' : '#2563EB',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      }
    }

    if (isSelected) return undefined

    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#2563EB',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    }
  }, [])

  // 하단 카드 높이를 고려해 마커가 보이는 영역 중앙에 오도록 panTo 위치 보정
  const getAdjustedPosition = useCallback(
    (map: google.maps.Map, position: google.maps.LatLng): google.maps.LatLng => {
      const offset = bottomOffsetRef.current
      if (!offset) return position
      const zoom = map.getZoom() ?? 15
      // 현재 줌에서 1픽셀 = 몇 도(위도)인지 계산
      const latDegreesPerPixel = 360 / (256 * Math.pow(2, zoom))
      // 카드 절반 높이만큼 남쪽(아래)으로 내린 지점을 중심으로 → 마커가 위쪽에 위치
      return new window.google.maps.LatLng(
        position.lat() - (offset / 2) * latDegreesPerPixel,
        position.lng()
      )
    },
    []
  )


  const initMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 35.6762, lng: 139.6503 }, // 도쿄 기본값
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    })

    mapInstanceRef.current = map
    setIsLoaded(true)
  }, [])

  // Google Maps 스크립트 로드
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return
    }

    if (window.google?.maps) {
      initMap()
      return
    }

    const existingScript = document.getElementById('google-maps-script')
    if (existingScript) {
      window.initGoogleMap = initMap
      return
    }

    window.initGoogleMap = initMap

    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMap`
    script.async = true
    script.defer = true
    script.onerror = () => setLoadError(true)
    document.head.appendChild(script)

    return () => {
      delete window.initGoogleMap
    }
  }, [initMap])

  // 마커 업데이트
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current) return

    const map = mapInstanceRef.current

    // 기존 마커 제거
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current.clear()
    infoWindowsRef.current.forEach((infoWindow) => infoWindow.close())
    infoWindowsRef.current.clear()

    const validPlaces = normalizedPlacesRef.current

      if (validPlaces.length === 0) return

    validPlaces.forEach((place) => {
      const markerLabel = markerLabelsRef.current?.[place.id]
      const marker = new window.google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map,
        title: place.name,
        label: markerLabel
          ? {
              text: markerLabel,
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '700',
            }
          : undefined,
        icon: getMarkerIcon(place.id),
        zIndex: 1,
      })
      const mapsUrl = buildGoogleMapsUrl(place)
      const categoryLabel = place.category ? CATEGORY_LABELS[place.category] ?? place.category : undefined

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="width:240px;padding:6px 4px 4px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <p style="font-weight:700;margin:0 0 6px;font-size:15px;line-height:1.35;color:#111827;">${escapeHtml(place.name)}</p>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
              ${place.rating ? `<span style="color:#F59E0B;font-size:12px;font-weight:600;">★ ${place.rating}${place.review_count ? ` (${place.review_count.toLocaleString()})` : ''}</span>` : ''}
              ${categoryLabel ? `<span style="display:inline-block;font-size:11px;background:#EFF6FF;color:#2563EB;padding:3px 8px;border-radius:999px;">${escapeHtml(categoryLabel)}</span>` : ''}
            </div>
            ${place.address ? `<p style="color:#4B5563;font-size:12px;line-height:1.45;margin:0 0 10px;">${escapeHtml(place.address)}</p>` : ''}
            ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;color:#2563EB;font-size:12px;font-weight:600;text-decoration:none;">Google Maps에서 보기 ↗</a>` : ''}
          </div>
        `,
      })

      marker.addListener('click', () => {
        onPlaceClickRef.current?.(place)
      })

      markersRef.current.set(place.id, marker)
      infoWindowsRef.current.set(place.id, infoWindow)
    })

    // 마커 재생성 후 현재 선택 상태 즉시 반영
    const currentSelectedId = selectedPlaceIdRef.current
    if (currentSelectedId) {
      markersRef.current.forEach((marker, placeId) => {
        marker.setIcon(getMarkerIcon(placeId, currentSelectedId))
        marker.setZIndex(placeId === currentSelectedId ? 100 : 1)
      })
    }
  }, [isLoaded, placesKey, markerLabelsKey, getMarkerIcon])

  // 장소 목록이 바뀔 때만 전체 마커가 보이도록 카메라 조정
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current) return

    const map = mapInstanceRef.current
    const validPlaces = normalizedPlacesRef.current
    if (validPlaces.length === 0) return
    if (selectedPlaceId && validPlaces.some((place) => place.id === selectedPlaceId)) return

    const bounds = new window.google.maps.LatLngBounds()
    validPlaces.forEach((place) => {
      bounds.extend({ lat: place.lat, lng: place.lng })
    })

    const fitMapToPlaces = () => {
      window.google.maps.event.trigger(map, 'resize')

      if (validPlaces.length === 1) {
        map.setCenter({ lat: validPlaces[0].lat, lng: validPlaces[0].lng })
        map.setZoom(15)
        return
      }

      map.fitBounds(bounds, {
        top: 80,
        right: 80,
        bottom: 140,
        left: 80,
      })
    }

    const animationFrame = window.requestAnimationFrame(fitMapToPlaces)
    const retryTimeout = window.setTimeout(fitMapToPlaces, 250)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(retryTimeout)
    }
  }, [isLoaded, placesKey, selectedPlaceId])

  // 선택된 장소로 이동
  useEffect(() => {
    if (!isLoaded || !selectedPlaceId) {
      infoWindowsRef.current.forEach((infoWindow) => infoWindow.close())
      return
    }

    let cancelled = false

    const focusSelectedPlace = () => {
      if (cancelled || !mapInstanceRef.current) return

      const map = mapInstanceRef.current

      markersRef.current.forEach((marker, placeId) => {
        marker.setIcon(getMarkerIcon(placeId, selectedPlaceId))
        marker.setZIndex(placeId === selectedPlaceId ? 100 : 1)
      })

      // 팝업 없이 마커 위치로만 이동 (상세 정보는 시트에서 표시)
      const marker = markersRef.current.get(selectedPlaceId)
      let position = marker?.getPosition()
      if (!position) {
        const selectedPlace = normalizedPlacesRef.current.find((place) => place.id === selectedPlaceId)
        if (selectedPlace) {
          position = new window.google.maps.LatLng(selectedPlace.lat, selectedPlace.lng)
        }
      }
      if (position) {
        window.google.maps.event.trigger(map, 'resize')
        map.setCenter(getAdjustedPosition(map, position))
      }
      if ((map.getZoom() ?? 0) < 15) {
        map.setZoom(15)
      }
      infoWindowsRef.current.forEach((iw) => iw.close())
    }

    focusSelectedPlace()
    const animationFrame = window.requestAnimationFrame(focusSelectedPlace)
    const retryTimeout = window.setTimeout(focusSelectedPlace, 250)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(retryTimeout)
    }
  }, [isLoaded, selectedPlaceId, placesKey, getMarkerIcon, getAdjustedPosition])

  if (loadError) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-100 rounded-xl text-gray-400 text-sm"
      >
        <div className="text-center">
          <p className="font-medium">지도를 불러올 수 없습니다.</p>
          <p className="text-xs mt-1">Google Maps API 키를 확인해주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative" style={{ height }}>
      <div ref={mapRef} className="w-full h-full rounded-xl" />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">지도 불러오는 중...</p>
          </div>
        </div>
      )}
    </div>
  )
}
