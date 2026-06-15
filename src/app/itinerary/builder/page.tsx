'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Wand2, MapPin, CheckSquare, Square, Plane, ChevronDown, ChevronUp } from 'lucide-react'
import type { FlightInput, FlightSearchResult, UserSavedPlace } from '@/types'

interface FoundFlight extends FlightSearchResult {
  date: string
}

function getTodayLocalDate(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const TRAVEL_STYLES = [
  { value: 'food', label: '맛집 탐방' },
  { value: 'shopping', label: '쇼핑' },
  { value: 'nature', label: '자연/공원' },
  { value: 'culture', label: '문화/역사' },
  { value: 'cafe', label: '카페 투어' },
  { value: 'local', label: '로컬 여행' },
  { value: 'low walking', label: '도보 최소화' },
]

export default function ItineraryBuilderPage() {
  const router = useRouter()
  const [savedPlaces, setSavedPlaces] = useState<UserSavedPlace[]>([])
  const [loadingPlaces, setLoadingPlaces] = useState(true)

  // 폼 상태
  const [city, setCity] = useState('')
  const [days, setDays] = useState(2)
  const [startDate, setStartDate] = useState(getTodayLocalDate)
  const [baseLocation, setBaseLocation] = useState('')
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [mustVisitIds, setMustVisitIds] = useState<string[]>([])
  const [selectedPlaceCity, setSelectedPlaceCity] = useState('전체')

  // 항공편 상태
  const [showFlightSection, setShowFlightSection] = useState(false)
  const [deptFlightNum, setDeptFlightNum] = useState('')
  const [deptFlightDate, setDeptFlightDate] = useState('')
  const [retFlightNum, setRetFlightNum] = useState('')
  const [retFlightDate, setRetFlightDate] = useState('')
  const [foundDeptFlight, setFoundDeptFlight] = useState<FoundFlight | null>(null)
  const [foundRetFlight, setFoundRetFlight] = useState<FoundFlight | null>(null)
  const [searchingFlight, setSearchingFlight] = useState<'departure' | 'return' | null>(null)
  const [flightError, setFlightError] = useState('')

  // 생성 상태
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/places')
      .then((r) => r.json())
      .then((data) => setSavedPlaces(Array.isArray(data) ? data : []))
      .finally(() => setLoadingPlaces(false))
  }, [])

  const toggleStyle = (style: string) => {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    )
  }

  const toggleMustVisit = (placeId: string) => {
    setMustVisitIds((prev) =>
      prev.includes(placeId) ? prev.filter((id) => id !== placeId) : [...prev, placeId]
    )
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

  const visibleSavedPlaces = useMemo(
    () =>
      selectedPlaceCity === '전체'
        ? savedPlaces
        : savedPlaces.filter((sp) => sp.place?.city === selectedPlaceCity),
    [savedPlaces, selectedPlaceCity]
  )

  const searchFlight = async (type: 'departure' | 'return') => {
    const flightNum = type === 'departure' ? deptFlightNum : retFlightNum
    const date = type === 'departure' ? deptFlightDate : retFlightDate
    if (!flightNum.trim() || !date) {
      setFlightError('항공편명과 날짜를 입력해주세요.')
      return
    }
    setFlightError('')
    setSearchingFlight(type)
    const yyyymmdd = date.replace(/-/g, '')
    try {
      const res = await fetch(`/api/flights/search?flightNum=${encodeURIComponent(flightNum.trim())}&date=${yyyymmdd}`)
      const data = await res.json()
      if (!res.ok || !data.flights?.length) {
        setFlightError('항공편을 찾을 수 없습니다. 편명과 날짜를 확인해주세요.')
        return
      }
      const found: FoundFlight = { ...data.flights[0], date }
      if (type === 'departure') setFoundDeptFlight(found)
      else setFoundRetFlight(found)
    } catch {
      setFlightError('항공편 조회 중 오류가 발생했습니다.')
    } finally {
      setSearchingFlight(null)
    }
  }

  const toFlightInput = (f: FoundFlight, type: 'departure' | 'return'): FlightInput => ({
    flight_type: type,
    flight_num: f.flightNum,
    airline_korean: f.airlineKorean,
    airline_english: f.airlineEnglish,
    airport: f.airport,
    airport_code: f.airportCode,
    city_code: f.cityCode,
    scheduled_date: f.date,
    scheduled_time: f.scheduledTime,
    io_type: f.ioType,
  })

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!city.trim()) {
      setError('도시를 입력해주세요.')
      return
    }
    setError('')
    setGenerating(true)

    try {
      const res = await fetch('/api/itineraries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: city.trim(),
          days,
          start_date: startDate,
          base_location: baseLocation.trim() || undefined,
          travel_style: selectedStyles.length > 0 ? selectedStyles : undefined,
          must_visit_place_ids: mustVisitIds,
          departure_flight: foundDeptFlight ? toFlightInput(foundDeptFlight, 'departure') : undefined,
          return_flight: foundRetFlight ? toFlightInput(foundRetFlight, 'return') : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '일정 생성에 실패했습니다.')
        return
      }
      router.push(`/itinerary/${data.id}?confirm=true`)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        내 지도로
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">AI 일정 만들기</h1>
      <p className="text-sm text-gray-500 mb-8">
        저장한 장소들을 기반으로 최적의 여행 동선을 생성합니다.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 입력 폼 */}
        <form onSubmit={handleGenerate} className="lg:col-span-2 flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
            {/* 도시 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">여행 도시 *</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="예: Tokyo, Osaka, Paris"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 여행 기간 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">여행 기간</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDays(Math.max(1, days - 1))}
                  className="w-9 h-9 border border-gray-300 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  -
                </button>
                <span className="text-sm font-semibold text-gray-900 min-w-[60px] text-center">
                  {days}박 {days + 1}일
                </span>
                <button
                  type="button"
                  onClick={() => setDays(Math.min(7, days + 1))}
                  className="w-9 h-9 border border-gray-300 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* 시작 날짜 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">여행 시작 날짜</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400">
                선택한 날짜 기준으로 영업 요일과 휴무일을 참고해 일정을 생성합니다.
              </p>
            </div>

            {/* 숙소 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">숙소/기준 위치</label>
              <input
                type="text"
                value={baseLocation}
                onChange={(e) => setBaseLocation(e.target.value)}
                placeholder="예: 신주쿠역, 우에노역"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 여행 스타일 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">여행 스타일 (복수 선택)</label>
              <div className="flex flex-wrap gap-2">
                {TRAVEL_STYLES.map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => toggleStyle(style.value)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedStyles.includes(style.value)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:border-blue-300'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 항공편 정보 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFlightSection((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-gray-400" />
                항공편 정보 <span className="text-gray-400 font-normal">(선택)</span>
                {(foundDeptFlight || foundRetFlight) && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                    {[foundDeptFlight && '출발', foundRetFlight && '귀국'].filter(Boolean).join(' · ')} 등록됨
                  </span>
                )}
              </span>
              {showFlightSection ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showFlightSection && (
              <div className="px-5 pb-5 flex flex-col gap-4 border-t border-gray-100 pt-4">
                {flightError && (
                  <p className="text-xs text-red-500">{flightError}</p>
                )}

                {/* 출발편 */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">출발편</p>
                  {foundDeptFlight ? (
                    <div className="flex items-start justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                      <div className="text-xs text-blue-800 leading-relaxed">
                        <span className="font-semibold">{foundDeptFlight.flightNum}</span>
                        {foundDeptFlight.airlineKorean && ` · ${foundDeptFlight.airlineKorean}`}
                        <br />
                        {foundDeptFlight.airport} {foundDeptFlight.ioType === 'OUT' ? '출발' : '도착'} {foundDeptFlight.scheduledTime}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFoundDeptFlight(null)}
                        className="shrink-0 text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 whitespace-nowrap"
                      >
                        다시 선택
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={deptFlightNum}
                        onChange={(e) => setDeptFlightNum(e.target.value)}
                        placeholder="편명 (예: YP731)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="date"
                        value={deptFlightDate}
                        onChange={(e) => setDeptFlightDate(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => searchFlight('departure')}
                        disabled={searchingFlight === 'departure'}
                        className="px-3 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {searchingFlight === 'departure' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '조회'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 귀국편 */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">귀국편</p>
                  {foundRetFlight ? (
                    <div className="flex items-start justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                      <div className="text-xs text-blue-800 leading-relaxed">
                        <span className="font-semibold">{foundRetFlight.flightNum}</span>
                        {foundRetFlight.airlineKorean && ` · ${foundRetFlight.airlineKorean}`}
                        <br />
                        {foundRetFlight.airport} {foundRetFlight.ioType === 'OUT' ? '출발' : '도착'} {foundRetFlight.scheduledTime}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFoundRetFlight(null)}
                        className="shrink-0 text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 whitespace-nowrap"
                      >
                        다시 선택
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={retFlightNum}
                        onChange={(e) => setRetFlightNum(e.target.value)}
                        placeholder="편명 (예: YP732)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="date"
                        value={retFlightDate}
                        onChange={(e) => setRetFlightDate(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => searchFlight('return')}
                        disabled={searchingFlight === 'return'}
                        className="px-3 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {searchingFlight === 'return' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '조회'}
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  항공편 시간을 참고해 Day 1 및 마지막 날 일정을 조정합니다.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={generating || savedPlaces.length === 0}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />AI가 일정을 생성 중...</>
            ) : (
              <><Wand2 className="w-4 h-4" />일정 자동 생성</>
            )}
          </button>
        </form>

        {/* 꼭 갈 장소 선택 */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {generating && (
            <div className="bg-white rounded-2xl border border-blue-200 p-8 text-center">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="font-semibold text-gray-800">AI가 최적 동선을 계산 중...</p>
              <p className="text-sm text-gray-400 mt-1">장소 간 거리, 이동시간, 카테고리를 분석합니다.</p>
              <p className="text-xs text-gray-400 mt-3">완성되면 일정 상세 화면으로 이동합니다.</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">꼭 가고 싶은 장소</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  선택한 장소는 일정에 우선 반영됩니다.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                {mustVisitIds.length}개 선택
              </span>
            </div>

            {loadingPlaces ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : savedPlaces.length === 0 ? (
              <div className="p-12 text-center">
                <MapPin className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                <p className="mb-1 font-medium text-gray-400">저장된 장소가 없습니다</p>
                <p className="mb-4 text-sm text-gray-300">먼저 콘텐츠에서 장소를 찾아 내 지도에 저장해주세요.</p>
                <Link href="/sources/new" className="text-sm font-medium text-blue-600 hover:underline">
                  콘텐츠에서 장소 찾기
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <select
                    value={selectedPlaceCity}
                    onChange={(event) => setSelectedPlaceCity(event.target.value)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none transition focus:border-blue-400"
                  >
                    <option value="전체">전체 지역</option>
                    {cityOptions.map((cityOption) => (
                      <option key={cityOption} value={cityOption}>
                        {cityOption}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">
                    {visibleSavedPlaces.length}개 표시
                  </p>
                </div>

                {visibleSavedPlaces.length === 0 ? (
                  <div className="p-12 text-center">
                    <MapPin className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                    <p className="mb-1 font-medium text-gray-400">이 지역에 저장된 장소가 없습니다</p>
                    <button
                      type="button"
                      onClick={() => setSelectedPlaceCity('전체')}
                      className="mt-3 text-sm font-medium text-blue-600 hover:underline"
                    >
                      전체 지역 보기
                    </button>
                  </div>
                ) : (
                  <ul className="grid max-h-[510px] grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
                    {visibleSavedPlaces.map((sp) => {
                      const place = sp.place
                      if (!place) return null
                      const isSelected = mustVisitIds.includes(place.id)
                      return (
                        <li
                          key={sp.id}
                          onClick={() => toggleMustVisit(place.id)}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                            isSelected
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-gray-100 hover:border-blue-100 hover:bg-gray-50'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          ) : (
                            <Square className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">{place.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                              {place.city && <span>{place.city}</span>}
                              {place.category && <span>{place.category}</span>}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
