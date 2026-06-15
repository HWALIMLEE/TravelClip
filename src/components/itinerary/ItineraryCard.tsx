'use client'

import { Clock, MapPin, Train, Car, Bus, Footprints, ExternalLink, Info } from 'lucide-react'
import type { ItineraryItem } from '@/types'
import { buildGoogleMapsUrl } from '@/lib/maps'

interface DayGroup {
  day: number
  theme?: string
  items: ItineraryItem[]
}

interface ItineraryCardProps {
  dayGroup: DayGroup
  startDate?: string
  compact?: boolean
  selected?: boolean
  selectedPlaceId?: string
  onClick?: () => void
  onPlaceClick?: (item: ItineraryItem) => void
}

const TRANSPORT_ICONS: Record<string, React.ReactNode> = {
  walk: <Footprints className="w-3 h-3" />,
  train: <Train className="w-3 h-3" />,
  bus: <Bus className="w-3 h-3" />,
  taxi: <Car className="w-3 h-3" />,
}

const TRANSPORT_LABELS: Record<string, string> = {
  walk: '도보',
  train: '전철',
  bus: '버스',
  taxi: '택시',
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

function getDayLabel(day: number, startDate?: string): string {
  if (!startDate) return `${day}일차`
  const date = new Date(startDate)
  date.setDate(date.getDate() + day - 1)
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

export default function ItineraryCard({
  dayGroup,
  startDate,
  compact = false,
  selected = false,
  selectedPlaceId,
  onClick,
  onPlaceClick,
}: ItineraryCardProps) {
  const dayLabel = getDayLabel(dayGroup.day, startDate)

  return (
    <div
      onClick={onClick}
      className={`flex max-h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
      } ${onClick ? 'cursor-pointer hover:border-blue-300' : ''}`}
    >
      {/* 헤더 */}
      <div className={`${compact ? 'px-4 py-3' : 'px-5 py-4'} shrink-0 bg-blue-600`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium mb-0.5">Day {dayGroup.day}</p>
            <h3 className="text-white font-bold text-lg leading-tight">{dayLabel}</h3>
          </div>
          {dayGroup.theme && (
            <span className="text-xs bg-blue-500 text-blue-100 px-3 py-1 rounded-full">
              {dayGroup.theme}
            </span>
          )}
        </div>
      </div>

      {/* 장소 목록 */}
      <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
        {dayGroup.items.map((item, index) => {
          const place = item.place
          const mapsUrl = place ? buildGoogleMapsUrl(place) : undefined
          return (
            <div key={item.id} className="relative">
              {/* 이동 정보 (첫 번째 제외) */}
              {index > 0 && item.transport_method && item.transport_method !== 'null' && (
                <div className={`${compact ? 'px-4' : 'px-5'} flex items-center gap-2 bg-gray-50 py-2 text-xs text-gray-400`}>
                  <div className="flex items-center gap-1 text-gray-500">
                    {TRANSPORT_ICONS[item.transport_method] ?? <Car className="w-3 h-3" />}
                    <span>{TRANSPORT_LABELS[item.transport_method] ?? item.transport_method}</span>
                  </div>
                  {item.travel_minutes && item.travel_minutes > 0 && (
                    <span>이동 {item.travel_minutes}분</span>
                  )}
                </div>
              )}

              {/* 장소 카드 */}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onPlaceClick?.(item)
                }}
                className={`${compact ? 'gap-3 px-4 py-3' : 'gap-4 px-5 py-4'} flex w-full items-start text-left transition-colors ${
                  selectedPlaceId === place?.id ? 'bg-blue-50' : onPlaceClick ? 'hover:bg-gray-50' : ''
                }`}
              >
                {/* 순서 번호 */}
                <div className="shrink-0 w-7 h-7 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                  {item.order_index}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{place?.name}</p>
                      {place?.address && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{place.address}</p>
                      )}
                    </div>
                    {place?.category && (
                      <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[place.category] ?? place.category}
                      </span>
                    )}
                  </div>

                  {/* 시간 정보 */}
                  <div className="flex items-center gap-3 mt-2">
                    {item.start_time && (
                      <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                        <Clock className="w-3 h-3" />
                        {item.start_time.slice(0, 5)}
                      </span>
                    )}
                    {item.duration_minutes && (
                      <span className="text-xs text-gray-400">{item.duration_minutes}분 체류</span>
                    )}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="flex items-center gap-0.5 text-xs text-blue-500 hover:underline ml-auto"
                      >
                        <MapPin className="w-3 h-3" />
                        지도
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  {item.schedule_note && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{item.schedule_note}</span>
                    </div>
                  )}
                </div>
              </button>
            </div>
          )
        })}
      </div>

      {/* 요약 */}
      <div className={`${compact ? 'px-4' : 'px-5'} shrink-0 border-t border-gray-100 bg-gray-50 py-3`}>
        <p className="text-xs text-gray-400">
          총 {dayGroup.items.length}개 장소 ·{' '}
          {dayGroup.items.reduce((sum, item) => sum + (item.duration_minutes ?? 0), 0)}분 소요 예상
        </p>
      </div>
    </div>
  )
}
