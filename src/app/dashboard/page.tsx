'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Clock, Globe2, MapPin, Phone, Plus, Star, ExternalLink, Trash2, Filter, X, Search, Loader2 } from 'lucide-react'
import type { UserSavedPlace, Place } from '@/types'
import { buildGoogleMapsUrl } from '@/lib/maps'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const CATEGORIES = ['전체', 'restaurant', 'cafe', 'attraction', 'shopping', 'museum', 'park', 'hotel', 'transport', 'other']
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

interface PlaceDetails {
  rating?: number
  reviewCount?: number
  priceLevel?: number
  address?: string
  phone?: string
  website?: string
  googleMapsUrl?: string
  openNow?: boolean
  weekdayText?: string[]
  photo?: {
    url: string
    attributions?: string[]
  } | null
  reviews: Array<{
    authorName?: string
    profilePhotoUrl?: string
    rating?: number
    relativeTime?: string
    text?: string
  }>
}

export default function DashboardPage() {
  const [savedPlaces, setSavedPlaces] = useState<UserSavedPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [focusPlaceIds, setFocusPlaceIds] = useState<string[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>()
  const [selectedCategory, setSelectedCategory] = useState('전체')
  const [selectedCity, setSelectedCity] = useState('전체')
  const [unsaving, setUnsaving] = useState<string | null>(null)
  const [unsavingAll, setUnsavingAll] = useState(false)
  const [showAddPlace, setShowAddPlace] = useState(false)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const touchStartY = useRef<number>(0)
  const [manualPlaceName, setManualPlaceName] = useState('')
  const [manualCityHint, setManualCityHint] = useState('')
  const [manualAreaHint, setManualAreaHint] = useState('')
  const [addingPlace, setAddingPlace] = useState(false)
  const [addPlaceError, setAddPlaceError] = useState('')
  const [placeDetailsById, setPlaceDetailsById] = useState<Record<string, PlaceDetails>>({})
  const supabase = useMemo(() => createClient(), [])

  const handleMapPlaceClick = useCallback((place: Place) => {
    setSelectedPlaceId(place.id)
  }, [])

  const fetchPlaces = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/places')
    if (res.ok) {
      const data = await res.json()
      setSavedPlaces(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!selectedPlaceId) return
    const frame = window.requestAnimationFrame(() => setSheetExpanded(true))
    return () => window.cancelAnimationFrame(frame)
  }, [selectedPlaceId])

  useEffect(() => {
    if (!selectedPlaceId || placeDetailsById[selectedPlaceId]) return

    let cancelled = false
    fetch(`/api/places/${selectedPlaceId}/details`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setPlaceDetailsById((prev) => ({ ...prev, [selectedPlaceId]: data }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [placeDetailsById, selectedPlaceId])

  useEffect(() => {
    let frame: number | undefined
    const placeIds = new URLSearchParams(window.location.search).get('placeIds')
    if (placeIds) {
      const ids = placeIds.split(',').map((id) => id.trim()).filter(Boolean)
      frame = window.requestAnimationFrame(() => {
        setFocusPlaceIds(ids)
        setSelectedPlaceId(ids.length === 1 ? ids[0] : undefined)
      })
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      fetchPlaces()
    })
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
    // supabase는 useMemo로 안정화되어 있어 deps에 포함해도 한 번만 실행됨
  }, [fetchPlaces, supabase])

  const handleUnsave = async (placeId: string) => {
    setUnsaving(placeId)
    const res = await fetch(`/api/places/${placeId}/unsave`, { method: 'DELETE' })
    if (res.ok) {
      setSavedPlaces((prev) => prev.filter((sp) => sp.place_id !== placeId))
      if (selectedPlaceId === placeId) setSelectedPlaceId(undefined)
    }
    setUnsaving(null)
  }

  const handleUnsaveAll = async () => {
    const ok = window.confirm('내 지도에 저장된 모든 장소를 삭제할까요? 삭제한 저장 장소는 되돌릴 수 없습니다.')
    if (!ok) return

    setUnsavingAll(true)
    const res = await fetch('/api/places', { method: 'DELETE' })
    if (res.ok) {
      setSavedPlaces([])
      setSelectedPlaceId(undefined)
      setFocusPlaceIds([])
      setSelectedCity('전체')
      setSelectedCategory('전체')
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '저장된 장소를 전체 삭제하지 못했습니다.')
    }
    setUnsavingAll(false)
  }

  const handleAddPlace = async (event: React.FormEvent) => {
    event.preventDefault()
    setAddPlaceError('')
    if (!manualPlaceName.trim()) {
      setAddPlaceError('장소명을 입력해주세요.')
      return
    }

    setAddingPlace(true)
    const res = await fetch('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manualPlaceName.trim(),
        city_hint: manualCityHint.trim() || undefined,
        area_hint: manualAreaHint.trim() || undefined,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setAddPlaceError(data.error ?? '장소 저장에 실패했습니다.')
      setAddingPlace(false)
      return
    }

    setSavedPlaces((prev) => {
      const withoutDuplicate = prev.filter((sp) => sp.place_id !== data.place_id)
      return [data, ...withoutDuplicate]
    })
    setSelectedPlaceId(data.place_id)
    setSelectedCity('전체')
    setSelectedCategory('전체')
    setFocusPlaceIds([])
    setManualPlaceName('')
    setManualCityHint('')
    setManualAreaHint('')
    setShowAddPlace(false)
    setAddingPlace(false)
  }

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          savedPlaces
            .map((sp) => sp.place?.city?.trim())
            .filter((city): city is string => !!city)
        )
      ).sort((a, b) => a.localeCompare(b, 'ko')),
    [savedPlaces]
  )
  const filteredSavedPlaces = useMemo(
    () =>
      savedPlaces.filter((sp) => {
        const categoryMatches =
          selectedCategory === '전체' || sp.place?.category === selectedCategory
        const cityMatches = selectedCity === '전체' || sp.place?.city === selectedCity
        return categoryMatches && cityMatches
      }),
    [savedPlaces, selectedCategory, selectedCity]
  )
  const focusPlaceIdSet = useMemo(() => new Set(focusPlaceIds), [focusPlaceIds])
  const orderedSavedPlaces = useMemo(
    () =>
      focusPlaceIds.length > 0
        ? [...filteredSavedPlaces].sort((a, b) => {
            const aIndex = a.place ? focusPlaceIds.indexOf(a.place.id) : -1
            const bIndex = b.place ? focusPlaceIds.indexOf(b.place.id) : -1
            const aIsFocused = aIndex >= 0
            const bIsFocused = bIndex >= 0

            if (aIsFocused && bIsFocused) return aIndex - bIndex
            if (aIsFocused) return -1
            if (bIsFocused) return 1
            return 0
          })
        : filteredSavedPlaces,
    [filteredSavedPlaces, focusPlaceIds]
  )

  const places: Place[] = useMemo(
    () => orderedSavedPlaces.map((sp) => sp.place).filter(Boolean) as Place[],
    [orderedSavedPlaces]
  )
  const focusedPlaces: Place[] = useMemo(
    () =>
      focusPlaceIds.length > 0
        ? savedPlaces
            .map((sp) => sp.place)
            .filter((place): place is Place => !!place && focusPlaceIds.includes(place.id))
        : places,
    [focusPlaceIds, places, savedPlaces]
  )
  const mapPlaces = focusedPlaces.length > 0 ? focusedPlaces : places
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId),
    [places, selectedPlaceId]
  )
  const selectedMapsUrl = selectedPlace ? buildGoogleMapsUrl(selectedPlace) : undefined
  const selectedPlaceDetails = selectedPlaceId ? placeDetailsById[selectedPlaceId] : undefined
  const loadingSelectedDetails = !!selectedPlaceId && !!selectedPlace && !selectedPlaceDetails

  const renderSelectedPlaceDetails = (panelClassName: string) => {
    if (!selectedPlace) return null

    return (
      <div className={panelClassName}>
        {selectedPlaceDetails?.photo?.url && (
          <div className="h-40 w-full overflow-hidden bg-gray-100 sm:h-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPlaceDetails.photo.url}
              alt={selectedPlace.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <MapPin className="h-4 w-4 shrink-0 text-red-500" />
              <h2 className="truncate text-base font-bold text-gray-900">{selectedPlace.name}</h2>
            </div>
            {selectedPlace.category && (
              <span className="ml-6 text-xs text-blue-600">
                {CATEGORY_LABELS[selectedPlace.category] ?? selectedPlace.category}
              </span>
            )}
            {(selectedPlaceDetails?.rating ?? selectedPlace.rating) && (
              <div className="ml-6 mt-1 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="text-sm font-semibold text-amber-500">
                  {selectedPlaceDetails?.rating ?? selectedPlace.rating}
                </span>
                {(selectedPlaceDetails?.reviewCount ?? selectedPlace.review_count) && (
                  <span className="text-xs text-gray-400">
                    ({(selectedPlaceDetails?.reviewCount ?? selectedPlace.review_count)?.toLocaleString()})
                  </span>
                )}
                {selectedPlaceDetails?.priceLevel !== undefined && (
                  <span className="text-xs text-gray-400">{'₩'.repeat(selectedPlaceDetails.priceLevel)}</span>
                )}
              </div>
            )}
            {selectedPlace.address && (
              <p className="ml-6 mt-1 text-xs text-gray-500 line-clamp-2">{selectedPlace.address}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedPlaceId(undefined)}
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 px-4">
          {selectedMapsUrl && (
            <a
              href={selectedMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Google Maps
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => handleUnsave(selectedPlace.id)}
            disabled={unsaving === selectedPlace.id}
            className="flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            {unsaving === selectedPlace.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            삭제
          </button>
        </div>

        <div className="mt-3 space-y-2 px-4 pb-4">
          {loadingSelectedDetails && (
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              장소 상세 정보를 불러오는 중
            </div>
          )}

          {selectedPlaceDetails && (
            <>
              <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                {selectedPlaceDetails.openNow !== undefined && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-teal-600" />
                    <span className={selectedPlaceDetails.openNow ? 'font-semibold text-teal-700' : 'font-semibold text-red-500'}>
                      {selectedPlaceDetails.openNow ? '영업 중' : '영업 종료'}
                    </span>
                    {selectedPlaceDetails.weekdayText?.[0] && (
                      <span className="truncate text-gray-400">{selectedPlaceDetails.weekdayText[0]}</span>
                    )}
                  </div>
                )}
                {selectedPlaceDetails.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <span>{selectedPlaceDetails.phone}</span>
                  </div>
                )}
                {selectedPlaceDetails.website && (
                  <a
                    href={selectedPlaceDetails.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:underline"
                  >
                    <Globe2 className="h-3.5 w-3.5" />
                    웹사이트
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {selectedPlaceDetails.reviews.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">리뷰</p>
                  {selectedPlaceDetails.reviews.map((review, index) => (
                    <div key={`${review.authorName}-${index}`} className="rounded-lg border border-gray-100 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-gray-800">
                            {review.authorName ?? 'Google 사용자'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                            {review.rating && (
                              <span className="flex items-center gap-0.5 text-amber-500">
                                <Star className="h-3 w-3 fill-current" />
                                {review.rating}
                              </span>
                            )}
                            {review.relativeTime && <span>{review.relativeTime}</span>}
                          </div>
                        </div>
                      </div>
                      {review.text && (
                        <p className="line-clamp-3 text-xs leading-5 text-gray-600">{review.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900">내 지도</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {savedPlaces.length}개의 장소 저장됨
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {savedPlaces.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleUnsaveAll}
                  disabled={unsavingAll}
                  className="flex items-center gap-1 whitespace-nowrap text-xs text-red-600 border border-red-200 bg-white px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unsavingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span className="hidden xs:inline">전체 </span>삭제
                </button>
                <Link
                  href="/itinerary/builder"
                  target="_self"
                  className="flex items-center gap-1 whitespace-nowrap text-xs text-blue-600 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  일정 만들기
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowAddPlace(true)}
              className="flex items-center gap-1 whitespace-nowrap text-xs text-white bg-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              추가
            </button>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 sm:px-6 py-2 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex items-center gap-2 min-w-max">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={selectedCity}
            onChange={(event) => {
              setSelectedCity(event.target.value)
              setSelectedPlaceId(undefined)
            }}
            className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 outline-none transition focus:border-blue-400"
          >
            <option value="전체">전체 지역</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat)
                setSelectedPlaceId(undefined)
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="relative min-h-0 flex-1 overflow-hidden sm:flex sm:flex-row">
        {/* 지도 - 모바일: 전체 화면 / 데스크탑: 우측 영역 */}
        <div
          className="absolute inset-0 sm:relative sm:inset-auto sm:order-last sm:flex-1 sm:min-h-0 sm:overflow-hidden sm:bg-gray-50 sm:p-4"
          onClick={() => { if (sheetExpanded && !selectedPlaceId) setSheetExpanded(false) }}
        >
          <MapView
            places={mapPlaces}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={handleMapPlaceClick}
            height="100%"
            bottomOffset={selectedPlace ? 240 : 0}
          />
        </div>

        {/* 장소 목록 - 모바일: 바텀시트 / 데스크탑: 좌측 사이드바 */}
        <aside
          className={[
            'absolute bottom-0 left-0 right-0 h-[80%]',
            'sm:static sm:inset-auto sm:h-full sm:w-80 lg:w-96 sm:order-first',
            'bg-white rounded-t-2xl sm:rounded-none',
            'shadow-[0_-4px_24px_rgba(0,0,0,0.15)] sm:shadow-none sm:border-r sm:border-gray-200',
            'flex flex-col overflow-hidden shrink-0',
            'transition-transform duration-300 ease-out sm:transition-none sm:translate-y-0',
            selectedPlace
              ? 'translate-y-0'
              : sheetExpanded
                ? 'translate-y-0'
                : 'translate-y-[calc(100%-120px)]',
          ].join(' ')}
        >
          {/* 핸들 (모바일 전용) */}
          <div
            role="button"
            aria-label="접기 펼치기"
            className="sm:hidden flex items-center justify-center pt-4 pb-3 shrink-0"
            onClick={() => { if (!selectedPlaceId) setSheetExpanded((prev) => !prev) }}
            onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY }}
            onTouchMove={(e) => {
              if (selectedPlaceId) return
              const delta = e.touches[0].clientY - touchStartY.current
              if (sheetExpanded && delta > 60) setSheetExpanded(false)
              if (!sheetExpanded && delta < -60) setSheetExpanded(true)
            }}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {renderSelectedPlaceDetails('sm:hidden shrink-0 max-h-[58%] overflow-y-auto border-b border-gray-200 bg-white')}

          {/* 장소 목록 */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orderedSavedPlaces.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MapPin className="w-12 h-12 text-gray-200 mb-3" />
              {savedPlaces.length === 0 ? (
                <>
                  <p className="font-medium text-gray-400 mb-1">저장된 장소가 없습니다</p>
                  <p className="text-sm text-gray-400 mb-4">콘텐츠에서 장소를 찾아보세요</p>
                  <Link
                    href="/sources/new"
                    className="text-sm text-white bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    콘텐츠에서 장소 찾기
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-medium text-gray-400 mb-1">조건에 맞는 장소가 없습니다</p>
                  <p className="text-sm text-gray-400 mb-4">지역이나 카테고리 필터를 바꿔보세요</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCity('전체')
                      setSelectedCategory('전체')
                    }}
                    className="text-sm text-blue-600 border border-blue-200 bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    필터 초기화
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {!sheetExpanded && (
                <p className="sm:hidden text-center text-xs font-semibold text-gray-500 py-1.5">
                  {savedPlaces.length}개 장소 · 탭해서 펼치기
                </p>
              )}
              <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {orderedSavedPlaces.map((sp) => {
                const place = sp.place
                if (!place) return null
                const isSelected = selectedPlaceId === place.id
                const isFocused = focusPlaceIdSet.has(place.id)
                const mapsUrl = buildGoogleMapsUrl(place)
                return (
                  <li
                    key={sp.id}
                    onClick={() => setSelectedPlaceId(isSelected ? undefined : place.id)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isSelected || isFocused ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm text-gray-900 truncate">{place.name}</p>
                          {place.category && (
                            <span className="shrink-0 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                              {CATEGORY_LABELS[place.category] ?? place.category}
                            </span>
                          )}
                        </div>
                        {place.address && (
                          <p className="text-xs text-gray-400 truncate">{place.address}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {place.rating && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Star className="w-3 h-3 fill-current" />
                              {place.rating}
                            </span>
                          )}
                          {mapsUrl && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-blue-500 flex items-center gap-0.5 hover:underline"
                            >
                              지도 보기
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnsave(place.id)
                        }}
                        disabled={unsaving === place.id}
                        className="shrink-0 p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                        aria-label="저장 취소"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
              </ul>
            </div>
          )}
        </aside>

        {selectedPlace && (
          <section className="hidden sm:flex sm:h-full sm:w-[360px] lg:w-[420px] sm:shrink-0 sm:flex-col sm:overflow-hidden sm:border-r sm:border-gray-200 sm:bg-white">
            {renderSelectedPlaceDetails('flex min-h-0 flex-1 flex-col overflow-y-auto bg-white')}
          </section>
        )}
      </div>

      {showAddPlace && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">장소 직접 추가</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Google Maps에서 장소를 찾아 내 지도에 저장합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPlace(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddPlace} className="flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">장소명 *</label>
                <input
                  value={manualPlaceName}
                  onChange={(event) => {
                    setManualPlaceName(event.target.value)
                    setAddPlaceError('')
                  }}
                  placeholder="예: Camelback sandwich&espresso"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">도시</label>
                  <input
                    value={manualCityHint}
                    onChange={(event) => setManualCityHint(event.target.value)}
                    placeholder="예: 도쿄"
                    className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">지역</label>
                  <input
                    value={manualAreaHint}
                    onChange={(event) => setManualAreaHint(event.target.value)}
                    placeholder="예: 시부야"
                    className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {addPlaceError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {addPlaceError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddPlace(false)}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={addingPlace || !manualPlaceName.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingPlace ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
