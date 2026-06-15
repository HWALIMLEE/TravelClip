'use client'

import { useState } from 'react'
import { Camera, Link2, Loader2, Video } from 'lucide-react'

interface SourceFormProps {
  defaultUrl?: string
  onSubmit: (url: string) => Promise<void>
  loading?: boolean
}

export default function SourceForm({ defaultUrl = '', onSubmit, loading = false }: SourceFormProps) {
  const [url, setUrl] = useState(defaultUrl)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!url.trim()) {
      setError('URL을 입력해주세요.')
      return
    }

    const isYouTubeUrl = url.includes('youtube.com') || url.includes('youtu.be')
    const isInstagramUrl = url.includes('instagram.com')
    if (!isYouTubeUrl && !isInstagramUrl) {
      setError('YouTube 또는 Instagram URL을 입력해주세요.')
      return
    }

    try {
      await onSubmit(url.trim())
    } catch {
      setError('URL 저장 중 오류가 발생했습니다.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="source-url" className="text-sm font-medium text-gray-700">
          콘텐츠 URL
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Link2 className="w-5 h-5" />
          </div>
          <input
            id="source-url"
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError('') }}
            placeholder="YouTube 영상 또는 Instagram 게시글/Reels URL"
            disabled={loading}
            className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        {/* 지원 플랫폼 표시 */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Video className="w-4 h-4 text-red-500" />
          <span>YouTube 영상 · Instagram 게시글/Reels 지원</span>
          <Camera className="w-4 h-4 text-pink-500" />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            찾는 중...
          </>
        ) : (
          '장소 찾기 시작'
        )}
      </button>
    </form>
  )
}
