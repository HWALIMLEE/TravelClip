'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  MapPin,
  Calendar,
  Home,
  Share2,
  Loader2,
  AlertCircle,
  Globe,
  Lock,
  Pencil,
  Check,
  X,
  Plus,
  Save,
  Trash2,
  UserPlus,
  ExternalLink,
  ChevronDown,
  BookmarkPlus,
  Plane,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react'
import ItineraryCard from '@/components/itinerary/ItineraryCard'
import type { Itinerary, ItineraryFlight, ItineraryItem, Place, UserSavedPlace } from '@/types'
import { hasCoordinates } from '@/lib/maps'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

interface DayGroup {
  day: number
  theme?: string
  items: ItineraryItem[]
}

export default function ItineraryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [confirmMode, setConfirmMode] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>()
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [editingItems, setEditingItems] = useState(false)
  const [savingItems, setSavingItems] = useState(false)
  const [addingShared, setAddingShared] = useState(false)
  const [savedPlaces, setSavedPlaces] = useState<UserSavedPlace[]>([])
  const [addPlaceByDay, setAddPlaceByDay] = useState<Record<number, string>>({})
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [headerExpanded, setHeaderExpanded] = useState(false)
  const touchStartY = useRef<number>(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (window.innerWidth >= 640) setHeaderExpanded(true)
  }, [])
  const dayScrollRef = useRef<HTMLDivElement>(null)

  const loadItinerary = () => {
    fetch(`/api/itineraries/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setItinerary(data)
          setTitleDraft(data.title ?? '')
          if (!data.can_edit) setHeaderExpanded(true)
        }
      })
      .catch(() => setError('일정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadItinerary()
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('confirm') === 'true') setConfirmMode(true)
    }
  }, [id])

  useEffect(() => {
    fetch('/api/places')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSavedPlaces(data)
      })
      .catch(() => {
        setSavedPlaces([])
      })
  }, [])

  const handleTogglePublic = async () => {
    if (!itinerary) return
    if (!itinerary.can_edit) return
    setSharing(true)
    const newVisibility = itinerary.visibility === 'public' ? 'private' : 'public'
    const res = await fetch(`/api/itineraries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: newVisibility }),
    })
    if (res.ok) {
      const data = await res.json()
      setItinerary((prev) => prev ? { ...prev, visibility: data.visibility } : prev)
    }
    setSharing(false)
  }

  const handleCopyLink = async () => {
    if (!itinerary) return
    if (itinerary.can_edit && itinerary.visibility !== 'public') {
      setSharing(true)
      const res = await fetch(`/api/itineraries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      })
      if (res.ok) {
        const data = await res.json()
        setItinerary((prev) => prev ? { ...prev, visibility: data.visibility } : prev)
      } else {
        alert('공개 링크를 만들지 못했습니다.')
        setSharing(false)
        return
      }
      setSharing(false)
    }
    navigator.clipboard.writeText(window.location.href)
    alert('공개 링크가 복사되었습니다.')
  }

  const handleAddToMyItineraries = async () => {
    if (!itinerary) return
    setAddingShared(true)
    const res = await fetch(`/api/itineraries/${id}/collaborators`, { method: 'POST' })
    if (res.ok) {
      setItinerary((prev) =>
        prev
          ? {
              ...prev,
              can_edit: true,
              can_add_to_my_itineraries: false,
              shared_role: 'editor',
            }
          : prev
      )
      setEditingItems(true)
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '내 일정에 추가하지 못했습니다.')
    }
    setAddingShared(false)
  }

  const handleClone = async () => {
    setCloning(true)
    const res = await fetch(`/api/itineraries/${id}/clone`, { method: 'POST' })
    if (res.status === 401) {
      router.push(`/login?redirectTo=/itinerary/${id}`)
      return
    }
    if (res.ok) {
      const data = await res.json()
      router.push(`/itinerary/${data.id}`)
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '일정을 가져오지 못했습니다.')
    }
    setCloning(false)
  }

  const handleStartTitleEdit = () => {
    if (!itinerary) return
    setTitleDraft(itinerary.title)
    setEditingTitle(true)
    setHeaderExpanded(true)
  }

  const handleCancelTitleEdit = () => {
    setTitleDraft(itinerary?.title ?? '')
    setEditingTitle(false)
  }

  const handleSaveTitle = async () => {
    if (!itinerary) return
    const nextTitle = titleDraft.trim()
    if (!nextTitle) return

    setSavingTitle(true)
    const res = await fetch(`/api/itineraries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: nextTitle }),
    })

    if (res.ok) {
      const data = await res.json()
      setItinerary((prev) => (prev ? { ...prev, title: data.title } : prev))
      setEditingTitle(false)
    }
    setSavingTitle(false)
  }

  const normalizeItems = (items: ItineraryItem[]) => {
    const groups = items.reduce<Record<number, ItineraryItem[]>>((acc, item) => {
      if (!acc[item.day]) acc[item.day] = []
      acc[item.day].push(item)
      return acc
    }, {})

    return Object.values(groups)
      .flatMap((group) =>
        group
          .sort((a, b) => a.order_index - b.order_index)
          .map((item, index) => ({ ...item, order_index: index + 1 }))
      )
      .sort((a, b) => a.day - b.day || a.order_index - b.order_index)
  }

  const setItems = (updater: (items: ItineraryItem[]) => ItineraryItem[]) => {
    setItinerary((prev) => {
      if (!prev) return prev
      return { ...prev, items: normalizeItems(updater(prev.items ?? [])) }
    })
  }

  const handleUpdateItem = (
    itemId: string,
    patch: Partial<Pick<ItineraryItem, 'start_time' | 'duration_minutes' | 'travel_minutes' | 'transport_method' | 'day'>>
  ) => {
    setItems((items) => items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
  }

  const handleMoveItem = (itemId: string, direction: -1 | 1) => {
    setItems((items) => {
      const item = items.find((entry) => entry.id === itemId)
      if (!item) return items
      const sameDay = items
        .filter((entry) => entry.day === item.day)
        .sort((a, b) => a.order_index - b.order_index)
      const currentIndex = sameDay.findIndex((entry) => entry.id === itemId)
      const target = sameDay[currentIndex + direction]
      if (!target) return items
      return items.map((entry) => {
        if (entry.id === item.id) return { ...entry, order_index: target.order_index }
        if (entry.id === target.id) return { ...entry, order_index: item.order_index }
        return entry
      })
    })
  }

  const handleDeleteItem = async (item: ItineraryItem) => {
    const ok = window.confirm(`"${item.place?.name ?? '선택한 장소'}"를 일정에서 삭제할까요?`)
    if (!ok) return

    const res = await fetch(`/api/itineraries/${id}/items/${item.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((items) => items.filter((entry) => entry.id !== item.id))
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '일정 항목을 삭제하지 못했습니다.')
    }
  }

  const handleAddPlace = async (day: number) => {
    const placeId = addPlaceByDay[day]
    if (!placeId) return

    const res = await fetch(`/api/itineraries/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place_id: placeId, day }),
    })

    if (res.ok) {
      setAddPlaceByDay((prev) => ({ ...prev, [day]: '' }))
      await loadItinerary()
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '장소를 추가하지 못했습니다.')
    }
  }

  const handleDeleteFlight = async (flight: ItineraryFlight) => {
    const label = flight.flight_type === 'departure' ? '출발편' : '귀국편'
    if (!window.confirm(`${label} (${flight.flight_num})을 삭제할까요?`)) return
    const res = await fetch(`/api/itineraries/${id}/flights?flightId=${flight.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItinerary((prev) =>
        prev ? { ...prev, flights: (prev.flights ?? []).filter((f) => f.id !== flight.id) } : prev
      )
    }
  }

  const handleSendChat = async () => {
    const message = chatInput.trim()
    if (!message || chatSending) return
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: message }])
    setChatSending(true)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const res = await fetch(`/api/itineraries/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: chatMessages.slice(-20),
        }),
      })
      const data = await res.json()
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply ?? '완료됐습니다.' }])
      if (data.ops_applied?.length) await loadItinerary()
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }])
    } finally {
      setChatSending(false)
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        chatInputRef.current?.focus()
      }, 50)
    }
  }

  const handleDiscard = async () => {
    if (!window.confirm('이 일정을 삭제하고 다시 만들까요?')) return
    setDiscarding(true)
    await fetch(`/api/itineraries/${id}`, { method: 'DELETE' })
    router.push('/itinerary/builder')
  }

  const handleSaveItems = async () => {
    if (!itinerary?.items) return
    setSavingItems(true)
    const res = await fetch(`/api/itineraries/${id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: normalizeItems(itinerary.items).map((item) => ({
          id: item.id,
          day: item.day,
          order_index: item.order_index,
          start_time: item.start_time || null,
          duration_minutes: item.duration_minutes ?? null,
          transport_method: item.transport_method || null,
          travel_minutes: item.travel_minutes ?? null,
        })),
      }),
    })

    if (res.ok) {
      setEditingItems(false)
      await loadItinerary()
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '일정 변경사항을 저장하지 못했습니다.')
    }
    setSavingItems(false)
  }

  // 일차별 그룹
  const dayGroups: DayGroup[] = useMemo(() => {
    if (!itinerary?.items) return []
    const groups: Record<number, DayGroup> = {}
    for (const item of itinerary.items) {
      if (!groups[item.day]) groups[item.day] = { day: item.day, items: [] }
      groups[item.day].items.push(item)
    }
    return Object.values(groups).sort((a, b) => a.day - b.day)
  }, [itinerary?.items])

  // start_date / end_date로 실제 총 일수 계산 (귀국일 포함)
  const totalDays = useMemo(() => {
    if (!itinerary?.start_date || !itinerary?.end_date) return dayGroups.length
    const start = new Date(itinerary.start_date + 'T00:00:00')
    const end = new Date(itinerary.end_date + 'T00:00:00')
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000)
    return Math.max(diffDays + 1, dayGroups.length)
  }, [itinerary?.start_date, itinerary?.end_date, dayGroups.length])

  // 아이템 없는 날(귀국일 등)도 포함한 전체 날 목록
  const allDayGroups = useMemo(() => {
    const groupMap = new Map(dayGroups.map((g) => [g.day, g]))
    return Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1
      return groupMap.get(day) ?? { day, items: [] as ItineraryItem[] }
    })
  }, [dayGroups, totalDays])

  // 선택된 장소의 일정 아이템
  const selectedItem = useMemo(
    () =>
      selectedPlaceId
        ? (itinerary?.items ?? []).find((item) => item.place?.id === selectedPlaceId)
        : undefined,
    [itinerary?.items, selectedPlaceId]
  )

  // 지도에 표시할 장소들
  const allPlaces: Place[] = useMemo(
    () =>
      (itinerary?.items ?? [])
        .map((item) => item.place)
        .filter((p): p is Place & { lat: number; lng: number } => !!p && hasCoordinates(p)),
    [itinerary?.items]
  )

  const sortedItems = useMemo(
    () =>
      [...(itinerary?.items ?? [])].sort(
        (a, b) => a.day - b.day || a.order_index - b.order_index
      ),
    [itinerary?.items]
  )
  const selectedDayGroup = useMemo(
    () => (selectedDay ? dayGroups.find((group) => group.day === selectedDay) : undefined),
    [dayGroups, selectedDay]
  )
  const mapItems = useMemo(
    () => selectedDayGroup?.items ?? sortedItems,
    [selectedDayGroup?.items, sortedItems]
  )
  const mapPlaces: Place[] = useMemo(
    () =>
      mapItems
        .map((item) => item.place)
        .filter((p): p is Place & { lat: number; lng: number } => !!p && hasCoordinates(p)),
    [mapItems]
  )
  const markerLabels = useMemo(
    () =>
      mapItems.reduce<Record<string, string>>((labels, item, index) => {
        if (!item.place?.id || !hasCoordinates(item.place)) return labels
        labels[item.place.id] = selectedDay ? String(item.order_index) : String(index + 1)
        return labels
      }, {}),
    [mapItems, selectedDay]
  )

  const handleSelectDay = (day: number) => {
    setSelectedDay(day)
    setSelectedPlaceId(undefined)
    setSheetExpanded(false)
  }

  // 선택된 Day 카드를 가로 스크롤 중앙으로 이동
  useEffect(() => {
    if (!selectedDay || !dayScrollRef.current) return
    const container = dayScrollRef.current
    const cardWidth = 340
    const gap = 16
    const cardIndex = selectedDay - 1
    const cardLeft = cardIndex * (cardWidth + gap)
    const scrollTarget = cardLeft - (container.clientWidth - cardWidth) / 2
    container.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' })
  }, [selectedDay])

  const handleShowAllDays = () => {
    setSelectedDay(null)
    setSelectedPlaceId(undefined)
    setSheetExpanded(true)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (error || !itinerary) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="font-semibold text-gray-700 mb-2">{error || '일정을 찾을 수 없습니다.'}</p>
        <Link href="/dashboard" className="text-blue-600 text-sm hover:underline">
          내 지도로 돌아가기
        </Link>
      </div>
    )
  }

  const totalPlaces = itinerary.items?.length ?? 0
  const canEdit = !!itinerary.can_edit

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden bg-gray-50">
      {/* 저장 확인 배너 */}
      {confirmMode && (
        <div className="shrink-0 flex items-center justify-between gap-3 bg-blue-600 px-4 py-2.5">
          <p className="text-sm text-white font-medium">일정이 생성되었습니다. 저장할까요?</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setConfirmMode(false)}
              className="px-3 py-1.5 text-sm font-semibold bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              저장하기
            </button>
            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="px-3 py-1.5 text-sm text-blue-200 hover:text-white transition-colors"
            >
              {discarding ? <Loader2 className="w-4 h-4 animate-spin" /> : '다시 만들기'}
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6">

        {/* 항상 보이는 컴팩트 행 */}
        <div className="flex items-center gap-2 py-2.5">
          <Link
            href="/itinerary"
            className="shrink-0 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">내 일정</span>
          </Link>

          {/* 모바일에서만 컴팩트 제목/날짜 표시 */}
          <div className="flex-1 min-w-0 sm:hidden">
            <h1 className="truncate text-base font-bold text-gray-900 leading-tight">{itinerary.title}</h1>
            {itinerary.start_date && (
              <p className="text-xs text-gray-400">
                {new Date(itinerary.start_date).toLocaleDateString('ko-KR')}
                {itinerary.end_date && ` ~ ${new Date(itinerary.end_date).toLocaleDateString('ko-KR')}`}
              </p>
            )}
          </div>

          {/* 데스크탑에서 중앙 여백 */}
          <div className="hidden sm:block sm:flex-1" />

          {/* 아이콘 액션 버튼 (항상 표시) */}
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && !editingItems && (
              <button
                onClick={handleStartTitleEdit}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="제목 수정"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleCopyLink}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="링크 복사"
            >
              <Share2 className="w-4 h-4" />
            </button>
            {canEdit && (
              <button
                onClick={handleTogglePublic}
                disabled={sharing}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  itinerary.visibility === 'public' ? 'text-green-600' : 'text-gray-400'
                } hover:bg-gray-100`}
                aria-label="공개 설정"
              >
                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : itinerary.visibility === 'public' ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </button>
            )}
            {/* 펼침/접힘 토글 */}
            <button
              type="button"
              onClick={() => setHeaderExpanded((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
              aria-label={headerExpanded ? '헤더 접기' : '헤더 펼치기'}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${headerExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* 접을 수 있는 상세 영역 (모바일: 기본 숨김 / 데스크탑: 항상 표시) */}
        <div className={`pb-3 ${headerExpanded ? 'block' : 'hidden'}`}>
          {/* 데스크탑 전용 큰 제목 */}
          {!editingTitle && (
            <h1 className="hidden sm:block text-2xl font-bold text-gray-900 mb-2 leading-tight">
              {itinerary.title}
            </h1>
          )}

          {/* 제목 편집 (펼쳐졌을 때만) */}
          {editingTitle && (
            <div className="mb-3 flex items-center gap-2">
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveTitle()
                  if (event.key === 'Escape') handleCancelTitleEdit()
                }}
                className="min-w-0 flex-1 rounded-lg border border-blue-200 px-3 py-1.5 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                disabled={savingTitle || !titleDraft.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                aria-label="제목 저장"
              >
                {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleCancelTitleEdit}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                aria-label="제목 수정 취소"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 메타 정보 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-2">
            {itinerary.city && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />{itinerary.city}
              </span>
            )}
            {itinerary.start_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(itinerary.start_date).toLocaleDateString('ko-KR')}
                {itinerary.end_date && ` ~ ${new Date(itinerary.end_date).toLocaleDateString('ko-KR')}`}
              </span>
            )}
            {itinerary.base_location && (
              <span className="flex items-center gap-1">
                <Home className="w-4 h-4" />{itinerary.base_location}
              </span>
            )}
          </div>

          {/* 통계 */}
          <div className="flex gap-3 text-xs text-gray-400 mb-3">
            <span>{totalDays}일 일정</span>
            <span>·</span>
            <span>{totalPlaces}개 장소</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {itinerary.visibility === 'public'
                ? <><Globe className="w-3 h-3 text-green-500" />공개</>
                : <><Lock className="w-3 h-3" />비공개</>}
            </span>
          </div>

          {/* 텍스트 액션 버튼 */}
          <div className="flex items-center gap-2 flex-wrap">
            {!canEdit && (
              <button onClick={handleClone} disabled={cloning}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                내 일정으로 가져오기
              </button>
            )}
            {canEdit && editingItems ? (
              <>
                <button onClick={handleSaveItems} disabled={savingItems}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  일정 저장
                </button>
                <button onClick={() => { setEditingItems(false); loadItinerary() }}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  <X className="w-4 h-4" />취소
                </button>
              </>
            ) : canEdit ? (
              <button onClick={() => setEditingItems(true)}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100">
                <Pencil className="w-4 h-4" />일정 편집
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 지도 + 일정 카드 */}
      <div className="relative min-h-0 flex-1 overflow-hidden lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:gap-4 lg:p-4 lg:relative lg:overflow-visible lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* 지도 - 모바일: 전체 화면 배경 / 데스크탑: 좌측 컬럼 */}
        <div
          className="absolute inset-0 lg:relative lg:inset-auto lg:flex lg:min-h-0 lg:flex-col lg:gap-4"
          onClick={() => { if (sheetExpanded && !selectedItem) setSheetExpanded(false) }}
        >
          <div className="h-full lg:h-[52vh] lg:shrink-0 overflow-hidden lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:shadow-sm">
            {allPlaces.length > 0 ? (
              <MapView
                places={mapPlaces}
                selectedPlaceId={selectedPlaceId}
                markerLabels={markerLabels}
                onPlaceClick={(place) => setSelectedPlaceId(place.id)}
                height="100%"
                bottomOffset={selectedItem ? 220 : 0}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                지도에 표시할 위치 정보가 없습니다.
              </div>
            )}
          </div>

          {/* 장소 목록 (지도 아래, 데스크탑 전용) */}
          <div className="hidden lg:block min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {selectedDay ? `Day ${selectedDay} 장소` : '전체 장소 목록'}
              </h3>
              {selectedDay && (
                <button
                  type="button"
                  onClick={handleShowAllDays}
                  className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
                >
                  전체 보기
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {mapItems.map((item) => (
                <li
                  key={item.id}
                  onClick={() => setSelectedPlaceId(item.place?.id)}
                  className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPlaceId === item.place?.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="w-5 h-5 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center shrink-0">
                    {item.order_index}
                  </span>
                  <span className="truncate">{item.place?.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">Day {item.day}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 일차별 카드 - 모바일: 바텀시트 / 데스크탑: 우측 컬럼 */}
        <div
          className={[
            'absolute bottom-0 left-0 right-0 h-[72%]',
            'lg:static lg:inset-auto lg:h-auto lg:min-w-0 lg:overflow-hidden',
            'bg-white rounded-t-2xl lg:rounded-none',
            'shadow-[0_-4px_24px_rgba(0,0,0,0.15)] lg:shadow-none',
            'flex flex-col',
            'transition-transform duration-300 ease-out lg:transition-none lg:translate-y-0',
            selectedItem
              ? 'translate-y-[calc(100%-220px)]'
              : sheetExpanded
                ? 'translate-y-0'
                : 'translate-y-[calc(100%-128px)]',
          ].join(' ')}
        >
          {/* 핸들 (모바일 전용) */}
          <div
            role="button"
            aria-label="접기 펼치기"
            className="lg:hidden flex flex-col items-center justify-center pt-4 pb-3 shrink-0 w-full"
            onClick={() => { if (!selectedItem) setSheetExpanded((prev) => !prev) }}
            onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY }}
            onTouchMove={(e) => {
              if (selectedItem) return
              const delta = e.touches[0].clientY - touchStartY.current
              if (sheetExpanded && delta > 60) setSheetExpanded(false)
              if (!sheetExpanded && delta < -60) setSheetExpanded(true)
            }}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
            {!sheetExpanded && !selectedItem && (
              <span className="mt-2 text-xs font-semibold text-gray-500">
                {selectedDay ? `Day ${selectedDay} 일정 보기` : `${dayGroups.length}일 일정 보기`}
              </span>
            )}
          </div>

          {/* 선택된 장소 컴팩트 카드 (모바일 전용) */}
          {selectedItem && selectedItem.place && (
            <div className="lg:hidden flex flex-col shrink-0" style={{ height: 185 }}>
              <div className="flex items-start gap-3 px-4 pt-2 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {selectedItem.order_index}
                    </span>
                    <h2 className="truncate text-base font-bold text-gray-900">{selectedItem.place.name}</h2>
                  </div>
                  <div className="ml-8 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 font-medium">Day {selectedItem.day}</span>
                    {selectedItem.start_time && <span>⏰ {selectedItem.start_time.slice(0, 5)}</span>}
                    {selectedItem.duration_minutes && <span>{selectedItem.duration_minutes}분 체류</span>}
                  </div>
                  {selectedItem.place.address && (
                    <p className="ml-8 mt-1 text-xs text-gray-400 line-clamp-1">{selectedItem.place.address}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlaceId(undefined)
                    setSheetExpanded(true)
                  }}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2 px-4">
                {selectedItem.place.google_place_id && (
                  <a
                    href={`https://www.google.com/maps/place/?q=place_id:${selectedItem.place.google_place_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Google Maps
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlaceId(undefined)
                    setSheetExpanded(true)
                  }}
                  className="flex items-center gap-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  일정 보기
                </button>
              </div>
            </div>
          )}

          {/* 일정 카드 (장소 선택 시 모바일에서 숨김) */}
          <div className={selectedItem ? 'hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col' : 'flex min-h-0 flex-1 flex-col'}>

          {allDayGroups.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
              일정 아이템이 없습니다.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 lg:p-0">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  {selectedDay
                    ? `Day ${selectedDay} 장소만 지도에 표시 중`
                    : '전체 일정 장소를 지도에 표시 중'}
                </p>
                <button
                  type="button"
                  onClick={handleShowAllDays}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selectedDay === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  전체
                </button>
              </div>
              <div ref={dayScrollRef} className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-3">
                {allDayGroups.map((group) => {
                  const isFirstDay = group.day === 1
                  const isLastDay = group.day === totalDays
                  const departureFlight = isFirstDay ? (itinerary.flights ?? []).find((f) => f.flight_type === 'departure') : undefined
                  const returnFlight = isLastDay ? (itinerary.flights ?? []).find((f) => f.flight_type === 'return') : undefined
                  return (
                  <div key={group.day} className="w-[340px] shrink-0 sm:w-[380px] flex flex-col gap-2">
                    {/* 출발편 카드 (Day 1 상단) */}
                    {departureFlight && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Plane className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <div className="text-xs text-blue-800 leading-snug min-w-0">
                            <span className="font-semibold">{departureFlight.flight_num}</span>
                            {departureFlight.airline_korean && ` · ${departureFlight.airline_korean}`}
                            <span className="text-blue-500 ml-1">
                              {departureFlight.io_type === 'OUT' ? '출발' : '도착'} {departureFlight.scheduled_time}
                            </span>
                          </div>
                        </div>
                        {canEdit && editingItems && (
                          <button type="button" onClick={() => handleDeleteFlight(departureFlight)} className="text-blue-300 hover:text-blue-600 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {group.items.length === 0 ? (
                      <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-sm text-gray-400">
                        일정 없음
                      </div>
                    ) : editingItems ? (
                      <div className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
                        <div className="shrink-0 bg-blue-600 px-4 py-3">
                          <p className="mb-0.5 text-xs font-medium text-blue-200">Day {group.day}</p>
                          <h3 className="text-lg font-bold leading-tight text-white">
                            {itinerary.start_date
                              ? new Date(
                                  new Date(itinerary.start_date).setDate(
                                    new Date(itinerary.start_date).getDate() + group.day - 1
                                  )
                                ).toLocaleDateString('ko-KR', {
                                  month: 'long',
                                  day: 'numeric',
                                  weekday: 'short',
                                })
                              : `${group.day}일차`}
                          </h3>
                        </div>

                        <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
                          {group.items.map((item) => (
                            <div key={item.id} className="px-4 py-3">
                              <div className="mb-3 flex items-start gap-3">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                                  {item.order_index}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-gray-900">{item.place?.name}</p>
                                  {item.place?.address && (
                                    <p className="mt-0.5 truncate text-xs text-gray-400">{item.place.address}</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveItem(item.id, -1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                    aria-label="위로 이동"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveItem(item.id, 1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                    aria-label="아래로 이동"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"
                                    aria-label="장소 삭제"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-xs text-gray-500">
                                  시작 시간
                                  <input
                                    type="time"
                                    value={item.start_time?.slice(0, 5) ?? ''}
                                    onChange={(event) => handleUpdateItem(item.id, { start_time: event.target.value })}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </label>
                                <label className="text-xs text-gray-500">
                                  체류 시간
                                  <input
                                    type="number"
                                    min={0}
                                    step={10}
                                    value={item.duration_minutes ?? ''}
                                    onChange={(event) =>
                                      handleUpdateItem(item.id, {
                                        duration_minutes: event.target.value ? Number(event.target.value) : undefined,
                                      })
                                    }
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </label>
                                <label className="text-xs text-gray-500">
                                  이동 수단
                                  <select
                                    value={item.transport_method ?? ''}
                                    onChange={(event) => handleUpdateItem(item.id, { transport_method: event.target.value })}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">없음</option>
                                    <option value="walk">도보</option>
                                    <option value="train">전철</option>
                                    <option value="bus">버스</option>
                                    <option value="taxi">택시</option>
                                  </select>
                                </label>
                                <label className="text-xs text-gray-500">
                                  이동 시간
                                  <input
                                    type="number"
                                    min={0}
                                    step={5}
                                    value={item.travel_minutes ?? ''}
                                    onChange={(event) =>
                                      handleUpdateItem(item.id, {
                                        travel_minutes: event.target.value ? Number(event.target.value) : undefined,
                                      })
                                    }
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="shrink-0 border-t border-gray-100 bg-gray-50 p-3">
                          <div className="flex gap-2">
                            <select
                              value={addPlaceByDay[group.day] ?? ''}
                              onChange={(event) =>
                                setAddPlaceByDay((prev) => ({ ...prev, [group.day]: event.target.value }))
                              }
                              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">내 지도에서 장소 선택</option>
                              {savedPlaces.map((savedPlace) => (
                                <option key={savedPlace.place_id} value={savedPlace.place_id}>
                                  {savedPlace.place?.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAddPlace(group.day)}
                              disabled={!addPlaceByDay[group.day]}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="장소 추가"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <ItineraryCard
                        dayGroup={group}
                        startDate={itinerary.start_date}
                        compact
                        selected={selectedDay === group.day}
                        onClick={() => handleSelectDay(group.day)}
                        selectedPlaceId={selectedPlaceId}
                        onPlaceClick={(item) => {
                          setSelectedDay(item.day)
                          setSelectedPlaceId(item.place?.id)
                        }}
                      />
                    )}

                    {/* 귀국편 카드 (마지막 Day 하단) */}
                    {returnFlight && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Plane className="w-3.5 h-3.5 text-indigo-500 shrink-0 -scale-x-100" />
                          <div className="text-xs text-indigo-800 leading-snug min-w-0">
                            <span className="font-semibold">{returnFlight.flight_num}</span>
                            {returnFlight.airline_korean && ` · ${returnFlight.airline_korean}`}
                            <span className="text-indigo-500 ml-1">
                              {returnFlight.io_type === 'IN' ? '도착' : '출발'} {returnFlight.scheduled_time}
                            </span>
                          </div>
                        </div>
                        {canEdit && editingItems && (
                          <button type="button" onClick={() => handleDeleteFlight(returnFlight)} className="text-indigo-300 hover:text-indigo-600 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          )}
          </div>{/* 일정 카드 wrapper 닫기 */}
        </div>

        {/* 채팅 패널 - 모바일: 바텀시트 / 데스크탑: 우하단 floating 팝업 */}
        {chatOpen && (
          <>
            {/* 배경 오버레이 (모바일만) */}
            <div
              className="fixed inset-0 z-40 bg-black/40 sm:hidden"
              onClick={() => setChatOpen(false)}
            />

            {/* 채팅 패널 본체 */}
            <div className={[
              'flex flex-col bg-white',
              // 모바일: 바텀시트
              'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl h-[70vh]',
              // 데스크탑: 우하단 floating 팝업
              'sm:bottom-6 sm:left-auto sm:right-6 sm:w-96 sm:h-[520px] sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl',
            ].join(' ')}>
              {/* 채팅 헤더 */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-800">AI로 일정 수정</span>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 메시지 목록 */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="py-6 text-center">
                    <p className="text-sm text-gray-400 leading-relaxed">
                      일정 수정을 자연어로 요청해보세요.
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5 text-xs text-gray-400">
                      <span className="rounded-full bg-gray-50 px-3 py-1.5 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setChatInput('3일차 맛집을 2일차로 옮겨줘')}>
                        "3일차 맛집을 2일차로 옮겨줘"
                      </span>
                      <span className="rounded-full bg-gray-50 px-3 py-1.5 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setChatInput('1일차 첫 번째 장소 삭제해줘')}>
                        "1일차 첫 번째 장소 삭제해줘"
                      </span>
                      <span className="rounded-full bg-gray-50 px-3 py-1.5 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setChatInput('전체 일정 순서를 오전에 관광지, 오후에 카페/맛집으로 재배치해줘')}>
                        "오전 관광지, 오후 카페/맛집으로 재배치"
                      </span>
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatSending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* 입력창 */}
              <div className="shrink-0 border-t border-gray-100 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendChat()
                      }
                    }}
                    placeholder="일정 수정 요청 입력..."
                    rows={1}
                    disabled={chatSending}
                    className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement
                      target.style.height = 'auto'
                      target.style.height = `${Math.min(target.scrollHeight, 120)}px`
                    }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || chatSending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="전송"
                  >
                    {chatSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* FAB - 채팅이 닫혀있을 때 모든 화면에 표시 */}
      {canEdit && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-indigo-700 active:scale-95 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          AI 수정
        </button>
      )}
    </div>
  )
}
