'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, MapPin, Plus, RefreshCw, Trash2, Play, Camera, Video } from 'lucide-react'
import type { Source } from '@/types'

interface SourceWithCount extends Source {
  extracted_place_count: number
}

const STATUS_LABEL: Record<string, string> = {
  pending: '분석 대기',
  parsing: '분석 중',
  parsed: '분석 완료',
  failed: '분석 실패',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  parsing: 'bg-blue-50 text-blue-600',
  parsed: 'bg-green-50 text-green-600',
  failed: 'bg-red-50 text-red-500',
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'youtube') return <Play className="w-4 h-4 text-red-500" />
  if (platform === 'instagram') return <Camera className="w-4 h-4 text-pink-500" />
  return <Video className="w-4 h-4 text-gray-400" />
}

const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sources')
      .then((r) => r.json())
      .then((data) => setSources(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string, title?: string) => {
    const ok = window.confirm(`"${title ?? '이 콘텐츠'}"를 삭제할까요? 삭제된 콘텐츠는 복구할 수 없습니다.`)
    if (!ok) return
    setDeletingId(id)
    const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== id))
    } else {
      alert('삭제에 실패했습니다.')
    }
    setDeletingId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">저장한 콘텐츠</h1>
            <p className="text-sm text-gray-500 mt-1">
              {sources.length > 0 ? `총 ${sources.length}개의 콘텐츠` : '분석한 콘텐츠가 여기에 쌓입니다'}
            </p>
          </div>
          <Link
            href="/sources/new?new=1"
            className="flex items-center gap-1.5 text-sm text-white bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            새 콘텐츠 분석
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Video className="w-14 h-14 text-gray-200 mb-4" />
            <p className="font-medium text-gray-400 mb-1">아직 분석한 콘텐츠가 없습니다</p>
            <p className="text-sm text-gray-400 mb-6">YouTube나 Instagram URL을 붙여넣어 장소를 찾아보세요</p>
            <Link
              href="/sources/new?new=1"
              className="text-sm text-white bg-blue-600 px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              첫 번째 콘텐츠 분석하기
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex gap-0"
              >
                {/* 썸네일 */}
                <div className="relative w-36 sm:w-48 shrink-0 bg-gray-100">
                  {source.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={source.thumbnail_url}
                      alt={source.title ?? '썸네일'}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PlatformIcon platform={source.platform} />
                    </div>
                  )}
                  {/* 플랫폼 배지 */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                    <PlatformIcon platform={source.platform} />
                    <span>{PLATFORM_LABEL[source.platform] ?? source.platform}</span>
                  </div>
                </div>

                {/* 콘텐츠 */}
                <div className="flex-1 min-w-0 p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug">
                        {source.title ?? '(제목 없음)'}
                      </p>
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[source.status]}`}
                      >
                        {STATUS_LABEL[source.status] ?? source.status}
                      </span>
                    </div>
                    {source.creator && (
                      <p className="text-xs text-gray-400 mb-2">{source.creator}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {source.status === 'parsed' && (
                        <span className="flex items-center gap-1 text-blue-500 font-medium">
                          <MapPin className="w-3 h-3" />
                          {source.extracted_place_count}개 장소 추출됨
                        </span>
                      )}
                      <span>{new Date(source.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {source.status === 'parsed' && source.extracted_place_count > 0 && (
                      <Link
                        href={`/sources/new?sourceId=${source.id}`}
                        className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <MapPin className="w-3 h-3" />
                        결과 보기
                      </Link>
                    )}
                    {(source.status === 'pending' || source.status === 'failed') && (
                      <Link
                        href={`/sources/new?sourceId=${source.id}`}
                        className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        다시 분석
                      </Link>
                    )}
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      원본 보기
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => handleDelete(source.id, source.title ?? undefined)}
                      disabled={deletingId === source.id}
                      className="ml-auto flex items-center gap-1 text-xs text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deletingId === source.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
