'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, Loader2, MapPin, Plus, Route, Sparkles, Trash2, Users } from 'lucide-react'
import type { Itinerary } from '@/types'

function formatDateRange(startDate?: string, endDate?: string) {
  if (!startDate) return '날짜 미정'
  const start = new Date(startDate).toLocaleDateString('ko-KR')
  if (!endDate || endDate === startDate) return start
  return `${start} ~ ${new Date(endDate).toLocaleDateString('ko-KR')}`
}

export default function ItineraryListPage() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)

  const loadItineraries = () => {
    setLoading(true)
    fetch('/api/itineraries')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItineraries(data)
        } else {
          setError(data.error ?? '일정 목록을 불러오지 못했습니다.')
        }
      })
      .catch(() => setError('일정 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadItineraries()
  }, [])

  const handleDeleteItinerary = async (itinerary: Itinerary) => {
    const isShared = itinerary.shared_role && itinerary.shared_role !== 'owner'
    const ok = window.confirm(
      isShared
        ? `"${itinerary.title}" 일정을 내 목록에서 제거할까요? 원본 일정은 삭제되지 않습니다.`
        : `"${itinerary.title}" 일정을 삭제할까요? 삭제한 일정은 되돌릴 수 없습니다.`
    )
    if (!ok) return

    setDeletingId(itinerary.id)
    const res = await fetch(`/api/itineraries/${itinerary.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItineraries((prev) => prev.filter((item) => item.id !== itinerary.id))
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '일정을 삭제하지 못했습니다.')
    }
    setDeletingId(null)
  }

  const handleDeleteAll = async () => {
    const ok = window.confirm('저장된 모든 일정을 삭제할까요? 삭제한 일정은 되돌릴 수 없습니다.')
    if (!ok) return

    setDeletingAll(true)
    const res = await fetch('/api/itineraries', { method: 'DELETE' })
    if (res.ok) {
      setItineraries([])
    } else {
      const data = await res.json().catch(() => null)
      alert(data?.error ?? '전체 일정을 삭제하지 못했습니다.')
    }
    setDeletingAll(false)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 일정</h1>
          <p className="mt-1 text-sm text-gray-500">
            생성하거나 공유받은 여행 일정을 저장해두고 다시 확인할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {itineraries.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              전체 삭제
            </button>
          )}
          <Link
            href="/itinerary/builder"
            target="_self"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            새 일정 만들기
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex h-72 items-center justify-center rounded-2xl border border-gray-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
          {error}
        </div>
      ) : itineraries.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center">
          <Route className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-semibold text-gray-500">저장된 일정이 없습니다</p>
          <p className="mt-1 text-sm text-gray-400">저장한 장소를 기반으로 첫 일정을 만들어보세요.</p>
          <Link
            href="/itinerary/builder"
            target="_self"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4" />
            일정 만들기
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {itineraries.map((itinerary) => (
            <div
              key={itinerary.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <Link href={`/itinerary/${itinerary.id}`} className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-gray-900">{itinerary.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{new Date(itinerary.created_at).toLocaleDateString('ko-KR')} 생성</span>
                    {itinerary.shared_role && itinerary.shared_role !== 'owner' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-600">
                        <Users className="h-3 w-3" />
                        공유받음
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/itinerary/${itinerary.id}`}
                    className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600"
                  >
                    열기
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteItinerary(itinerary)}
                    disabled={deletingId === itinerary.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="일정 삭제"
                  >
                    {deletingId === itinerary.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Link href={`/itinerary/${itinerary.id}`} className="block space-y-2 text-sm text-gray-500">
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{itinerary.city ?? '도시 미정'}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{formatDateRange(itinerary.start_date, itinerary.end_date)}</span>
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
