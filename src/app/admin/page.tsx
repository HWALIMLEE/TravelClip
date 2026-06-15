'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Loader2, Star, StarOff } from 'lucide-react'
import type { Itinerary, FeaturedDisplay } from '@/types'

const COLOR_OPTIONS = [
  { key: 'blue', label: '블루', class: 'bg-blue-800' },
  { key: 'red', label: '레드', class: 'bg-red-800' },
  { key: 'green', label: '그린', class: 'bg-green-900' },
  { key: 'yellow', label: '옐로', class: 'bg-yellow-900' },
  { key: 'purple', label: '퍼플', class: 'bg-purple-900' },
  { key: 'slate', label: '슬레이트', class: 'bg-slate-700' },
  { key: 'orange', label: '오렌지', class: 'bg-orange-900' },
  { key: 'cyan', label: '시안', class: 'bg-cyan-900' },
]

const REGION_OPTIONS = ['일본', '동남아', '유럽', '미주', '기타']

type EditingState = {
  id: string
  color: string
  region: string
  route: string
  likes: string
  clones: string
  order: string
}

export default function AdminPage() {
  const router = useRouter()
  const [itineraries, setItineraries] = useState<(Itinerary & { place_count: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/itineraries')
      .then((res) => {
        if (res.status === 403) {
          router.replace('/')
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (!data) return
        if (Array.isArray(data)) {
          setItineraries(data)
        } else {
          setError(data.error ?? '불러오지 못했습니다.')
        }
      })
      .catch(() => setError('서버 오류'))
      .finally(() => setLoading(false))
  }, [router])

  const openEdit = (item: Itinerary & { place_count: number }) => {
    const d = item.featured_display ?? {}
    setEditing({
      id: item.id,
      color: d.color ?? 'blue',
      region: d.region ?? '일본',
      route: d.route ?? '',
      likes: String(d.likes ?? 0),
      clones: String(d.clones ?? 0),
      order: String(item.featured_order ?? ''),
    })
  }

  const toggleFeatured = async (item: Itinerary & { place_count: number }) => {
    setSaving(item.id)
    const newFeatured = !item.is_featured
    const res = await fetch(`/api/admin/itineraries/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_featured: newFeatured }),
    })
    const data = await res.json()
    if (res.ok) {
      setItineraries((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_featured: data.is_featured } : i))
      )
      if (newFeatured) openEdit({ ...item, is_featured: true })
    }
    setSaving(null)
  }

  const saveDisplay = async () => {
    if (!editing) return
    setSaving(editing.id)
    const featured_display: FeaturedDisplay = {
      color: editing.color,
      region: editing.region,
      route: editing.route,
      likes: Number(editing.likes) || 0,
      clones: Number(editing.clones) || 0,
    }
    const res = await fetch(`/api/admin/itineraries/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        featured_display,
        featured_order: editing.order ? Number(editing.order) : null,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setItineraries((prev) =>
        prev.map((i) =>
          i.id === editing.id
            ? { ...i, featured_display: data.featured_display, featured_order: data.featured_order }
            : i
        )
      )
      setEditing(null)
    }
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-white text-2xl font-bold mb-2">홈 피드 관리</h1>
        <p className="text-gray-400 text-sm mb-8">
          ★ 표시된 일정이 메인 화면 &apos;인기 일정&apos; 피드에 노출됩니다.
          일정의 공개 여부(Public)도 함께 설정해야 표시됩니다.
        </p>

        <div className="flex flex-col gap-4">
          {itineraries.map((item) => {
            const d = item.featured_display ?? {}
            const colorClass = COLOR_OPTIONS.find((c) => c.key === d.color)?.class ?? 'bg-blue-800'
            const isSaving = saving === item.id

            return (
              <div
                key={item.id}
                className={`rounded-xl border ${
                  item.is_featured ? 'border-yellow-500/50 bg-gray-800' : 'border-gray-700 bg-gray-800/50'
                } overflow-hidden`}
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    {item.is_featured && (
                      <div className={`w-3 h-3 rounded-full ${colorClass}`} />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{item.title}</span>
                        {item.is_featured && (
                          <span className="text-yellow-400 text-xs bg-yellow-400/10 px-2 py-0.5 rounded-full">
                            피드 노출중
                          </span>
                        )}
                        {item.visibility !== 'public' && (
                          <span className="text-gray-500 text-xs bg-gray-700 px-2 py-0.5 rounded-full">
                            비공개
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        {item.city ?? '도시 없음'} · {item.place_count}개 장소
                        {item.is_featured && item.featured_order != null && ` · 순서 ${item.featured_order}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/itinerary/${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {item.is_featured && (
                      <button
                        onClick={() => openEdit(item)}
                        className="px-3 py-1.5 text-xs text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        편집
                      </button>
                    )}
                    <button
                      onClick={() => toggleFeatured(item)}
                      disabled={isSaving}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        item.is_featured
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30'
                          : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
                      }`}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : item.is_featured ? (
                        <StarOff className="w-3.5 h-3.5" />
                      ) : (
                        <Star className="w-3.5 h-3.5" />
                      )}
                      {item.is_featured ? '피드 제거' : '피드 추가'}
                    </button>
                  </div>
                </div>

                {/* 편집 패널 */}
                {editing?.id === item.id && (
                  <div className="border-t border-gray-700 px-5 py-4 bg-gray-900/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">카드 색상</label>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_OPTIONS.map((c) => (
                            <button
                              key={c.key}
                              onClick={() => setEditing((e) => e && { ...e, color: c.key })}
                              className={`w-7 h-7 rounded-lg ${c.class} transition-transform ${
                                editing.color === c.key ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                              }`}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">지역 분류</label>
                        <div className="flex flex-wrap gap-2">
                          {REGION_OPTIONS.map((r) => (
                            <button
                              key={r}
                              onClick={() => setEditing((e) => e && { ...e, region: r })}
                              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                editing.region === r
                                  ? 'bg-white text-gray-900 border-white'
                                  : 'border-gray-600 text-gray-400 hover:border-gray-400'
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-gray-400 text-xs mb-1.5 block">동선 표시 텍스트</label>
                        <input
                          value={editing.route}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, route: e.target.value })}
                          placeholder="시부야 → 신주쿠 → 아사쿠사"
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-400"
                        />
                      </div>

                      <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">표시 좋아요 수</label>
                        <input
                          type="number"
                          value={editing.likes}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, likes: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                        />
                      </div>

                      <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">표시 복제 수</label>
                        <input
                          type="number"
                          value={editing.clones}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, clones: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                        />
                      </div>

                      <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">피드 노출 순서</label>
                        <input
                          type="number"
                          value={editing.order}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, order: e.target.value })}
                          placeholder="숫자가 작을수록 먼저 노출"
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-400"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditing(null)}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={saveDisplay}
                        disabled={saving === editing.id}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        {saving === editing.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        저장
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {itineraries.length === 0 && (
            <div className="text-center text-gray-500 py-16">
              일정이 없습니다. 먼저 일정을 만들어보세요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
