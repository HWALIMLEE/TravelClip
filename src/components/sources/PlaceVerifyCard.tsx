'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, MapPin, Star, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import type { ExtractedPlace } from '@/types'
import { buildGoogleMapsUrl } from '@/lib/maps'

interface PlaceVerifyCardProps {
  extractedPlace: ExtractedPlace
  onSave: (placeId: string, sourceId: string) => Promise<void>
  onReject: (extractedPlaceId: string) => Promise<void>
  selected?: boolean
  onToggleSelected?: (extractedPlaceId: string) => void
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

export default function PlaceVerifyCard({
  extractedPlace,
  onSave,
  onReject,
  selected = false,
  onToggleSelected,
}: PlaceVerifyCardProps) {
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)

  const place = extractedPlace.place
  const mapsUrl = place ? buildGoogleMapsUrl(place) : undefined

  const handleSave = async () => {
    if (!place) return
    setSaving(true)
    try {
      await onSave(place.id, extractedPlace.source_id)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    try {
      await onReject(extractedPlace.id)
      setRejected(true)
    } finally {
      setRejecting(false)
    }
  }

  const confidenceColor =
    (extractedPlace.confidence ?? 0) >= 0.7
      ? 'bg-green-100 text-green-700'
      : (extractedPlace.confidence ?? 0) >= 0.5
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-600'

  if (rejected) {
    return (
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 opacity-50">
        <div className="flex items-center gap-2 text-gray-400">
          <XCircle className="w-4 h-4" />
          <span className="text-sm">제외됨: {extractedPlace.raw_name}</span>
        </div>
      </div>
    )
  }

  if (saved) {
    return (
      <div className="border border-green-200 rounded-xl p-4 bg-green-50">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">저장됨: {place?.name ?? extractedPlace.raw_name}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-blue-200 transition-colors">
      {/* 헤더: 추출된 이름 + 신뢰도 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        {place && onToggleSelected && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(extractedPlace.id)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label={`${place.name} 저장 선택`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{extractedPlace.raw_name}</span>
            {extractedPlace.confidence !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}>
                신뢰도 {Math.round((extractedPlace.confidence ?? 0) * 100)}%
              </span>
            )}
            {extractedPlace.needs_reservation && (
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                예약 필요
              </span>
            )}
          </div>
          {(extractedPlace.city_hint || extractedPlace.area_hint) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {[extractedPlace.area_hint, extractedPlace.city_hint].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        {extractedPlace.category && (
          <span className="shrink-0 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
            {CATEGORY_LABELS[extractedPlace.category] ?? extractedPlace.category}
          </span>
        )}
      </div>

      {/* Google Places 매칭 결과 */}
      {place ? (
        <div className="bg-blue-50 rounded-lg p-3 mb-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900">{place.name}</p>
              {place.address && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{place.address}</p>
              )}
              <div className="flex items-center gap-3 mt-1">
                {place.rating && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <Star className="w-3 h-3 fill-current" />
                    {place.rating}
                    {place.review_count && (
                      <span className="text-gray-400">({place.review_count.toLocaleString()})</span>
                    )}
                  </span>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 flex items-center gap-0.5 hover:underline"
                  >
                    Maps에서 보기
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-400">
          Google Maps 매칭 결과 없음 (수동 검색이 필요합니다)
        </div>
      )}

      {/* 근거 텍스트 (접기/펼치기) */}
      {extractedPlace.evidence_text && (
        <div className="mb-3">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            원본 텍스트 {showEvidence ? '접기' : '보기'}
          </button>
          {showEvidence && (
            <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2 italic leading-relaxed">
              &ldquo;{extractedPlace.evidence_text}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !place}
          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          {saving ? '저장 중...' : '내 지도에 저장'}
        </button>
        <button
          onClick={handleReject}
          disabled={rejecting}
          className="flex items-center justify-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <XCircle className="w-4 h-4" />
          제외
        </button>
      </div>
    </div>
  )
}
