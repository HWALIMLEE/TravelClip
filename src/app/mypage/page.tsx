'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Check, Loader2, MapPin, Pencil, Route, Video, X } from 'lucide-react'
import type { User } from '@/types'

interface Stats {
  sources: number
  saved_places: number
  itineraries: number
}

export default function MyPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<User | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          router.push('/login')
          return
        }
        setProfile(data.profile)
        setStats(data.stats)
        setNameInput(data.profile?.name ?? '')
      })
      .finally(() => setLoading(false))
  }, [router])

  const handleSaveName = async () => {
    setNameError('')
    if (!nameInput.trim()) {
      setNameError('이름을 입력해주세요.')
      return
    }
    setSavingName(true)
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setNameError(data.error ?? '저장에 실패했습니다.')
      setSavingName(false)
      return
    }
    setProfile((prev) => prev ? { ...prev, name: data.name } : prev)
    setEditingName(false)
    setSavingName(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  const statCards = [
    { label: '분석한 콘텐츠', value: stats?.sources ?? 0, icon: <Video className="w-5 h-5 text-blue-500" />, href: '/sources' },
    { label: '저장한 장소', value: stats?.saved_places ?? 0, icon: <MapPin className="w-5 h-5 text-red-400" />, href: '/dashboard' },
    { label: '만든 일정', value: stats?.itineraries ?? 0, icon: <Route className="w-5 h-5 text-green-500" />, href: '/itinerary' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            {/* 아바타 */}
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() ?? profile?.email?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={nameInput}
                      onChange={(e) => {
                        setNameInput(e.target.value)
                        setNameError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') setEditingName(false)
                      }}
                      className="flex-1 text-base font-semibold border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="이름 입력"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false)
                        setNameInput(profile?.name ?? '')
                        setNameError('')
                      }}
                      className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {nameError && <p className="text-xs text-red-500">{nameError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {profile?.name ?? '이름 미설정'}
                  </p>
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
                    aria-label="이름 수정"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-sm text-gray-400 truncate mt-0.5">{profile?.email}</p>
            </div>
          </div>

          {/* 가입일 */}
          {profile?.created_at && (
            <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-50 pt-4">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {new Date(profile.created_at).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                에 가입
              </span>
            </div>
          )}
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {statCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 hover:border-blue-200 hover:shadow-md transition-all text-center"
            >
              {card.icon}
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 leading-tight">{card.label}</p>
            </Link>
          ))}
        </div>

        {/* 빠른 이동 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2">메뉴</p>
          {[
            { href: '/sources', label: '저장한 콘텐츠', desc: '분석한 YouTube · Instagram 목록' },
            { href: '/dashboard', label: '내 지도', desc: '저장한 장소를 지도에서 확인' },
            { href: '/itinerary', label: '내 일정', desc: '생성한 여행 일정 목록' },
            { href: '/itinerary/builder', label: '일정 만들기', desc: 'AI로 여행 동선 자동 생성' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <span className="text-gray-300 text-lg">›</span>
            </Link>
          ))}
        </div>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className="w-full py-3 text-sm text-red-500 border border-red-100 bg-white rounded-2xl hover:bg-red-50 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
