'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import SourceForm from '@/components/sources/SourceForm'
import PlaceVerifyCard from '@/components/sources/PlaceVerifyCard'
import type { ExtractedPlace, Source, Place } from '@/types'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

type Step = 'input' | 'loading' | 'saving' | 'parsing' | 'done' | 'error'
type LoadingPhase = 'content' | 'ai' | 'maps'
type ErrorPhase = 'content' | 'ai' | 'maps' | null

const loadingStages: {
  id: LoadingPhase
  title: string
  description: string
}[] = [
  {
    id: 'content',
    title: '콘텐츠 정보 확인 중',
    description: '본문과 설명란에서 장소 단서가 될 정보를 불러오고 있어요.',
  },
  {
    id: 'ai',
    title: 'AI가 장소 후보 찾는 중',
    description: '실제로 방문 가능한 장소 이름만 골라내고 있어요.',
  },
  {
    id: 'maps',
    title: 'Google Maps에서 위치 확인 중',
    description: '장소 후보를 정확한 지도 위치와 매칭하고 있어요.',
  },
]

const phaseOrder: LoadingPhase[] = ['content', 'ai', 'maps']

function LoadingProgress({
  phase,
  candidateCount,
}: {
  phase: LoadingPhase
  candidateCount: number
}) {
  const activeIndex = phaseOrder.indexOf(phase)
  const activeStage = loadingStages[activeIndex]
  const activeDescription =
    phase === 'maps' && candidateCount > 0
      ? `${candidateCount}개 장소 후보를 Google Maps의 정확한 위치와 매칭하고 있어요.`
      : activeStage?.description ?? '잠시만 기다려주세요.'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">
            {activeStage?.title ?? '장소를 찾는 중'}
          </h2>
          <p className="text-sm text-gray-500">
            {activeDescription}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {loadingStages.map((stage, index) => {
          const isComplete = index < activeIndex
          const isActive = index === activeIndex

          return (
            <div
              key={stage.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                isActive
                  ? 'border-blue-200 bg-blue-50'
                  : isComplete
                    ? 'border-green-100 bg-green-50'
                    : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div
                className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isComplete
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    isActive || isComplete ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {stage.title}
                </p>
                <p className={`mt-0.5 text-xs ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                  {stage.id === 'maps' && candidateCount > 0
                    ? `${candidateCount}개 장소 후보 위치를 확인하고 있어요.`
                    : stage.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getErrorCopy(phase: ErrorPhase, message: string) {
  if (phase === 'content') {
    return {
      title: '콘텐츠 정보를 가져오지 못했어요',
      description: message || '링크가 비공개이거나 플랫폼에서 정보를 가져올 수 없는 상태일 수 있어요.',
    }
  }

  if (phase === 'ai') {
    return {
      title: 'AI가 장소 후보를 찾는 중 문제가 생겼어요',
      description: message || '본문에 장소명이 부족하거나 AI 분석 중 문제가 발생했어요.',
    }
  }

  if (phase === 'maps') {
    return {
      title: 'Google Maps에서 위치를 확인하지 못했어요',
      description: message || '장소 후보는 찾았지만 지도 위치와 매칭하는 중 문제가 발생했어요.',
    }
  }

  return {
    title: '오류가 발생했습니다',
    description: message || '잠시 후 다시 시도해주세요.',
  }
}

function NewSourceContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultUrl = searchParams.get('url') ?? ''
  const sourceIdParam = searchParams.get('sourceId') ?? ''

  const [step, setStep] = useState<Step>('input')
  const [source, setSource] = useState<Source | null>(null)
  const [extractedPlaces, setExtractedPlaces] = useState<ExtractedPlace[]>([])
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([])
  const [savingSelected, setSavingSelected] = useState(false)
  const [movingToDashboard, setMovingToDashboard] = useState(false)
  const [savedSelectedCount, setSavedSelectedCount] = useState(0)
  const [savedDashboardPlaceIds, setSavedDashboardPlaceIds] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('content')
  const [errorPhase, setErrorPhase] = useState<ErrorPhase>(null)
  const [candidateCount, setCandidateCount] = useState(0)
  const startedRef = useRef(false)

  const resetToInput = useCallback(() => {
    setStep('input')
    setSource(null)
    setExtractedPlaces([])
    setSelectedPlaceIds([])
    setSavedSelectedCount(0)
    setSavedDashboardPlaceIds([])
    setErrorMsg('')
    setErrorPhase(null)
    setLoadingPhase('content')
    setCandidateCount(0)
    setMovingToDashboard(false)
    setSavingSelected(false)
  }, [])

  const runParse = useCallback(async (sourceId: string) => {
    setStep('parsing')
    setLoadingPhase('ai')

    const parseRes = await fetch(`/api/sources/${sourceId}/parse`, { method: 'POST' })
    if (!parseRes.ok) {
      const data = await parseRes.json()
      setErrorPhase('ai')
      setErrorMsg(data.error ?? 'AI 분석 중 오류가 발생했습니다.')
      setStep('error')
      return
    }

    const parseData = await parseRes.json()
    const extractedCandidateCount = parseData.candidateCount ?? parseData.extractedPlaces?.length ?? 0
    setCandidateCount(extractedCandidateCount)

    if (extractedCandidateCount === 0) {
      setExtractedPlaces([])
      setStep('done')
      return
    }

    setLoadingPhase('maps')

    const matchRes = await fetch(`/api/sources/${sourceId}/match`, { method: 'POST' })
    if (!matchRes.ok) {
      const data = await matchRes.json()
      setErrorPhase('maps')
      setErrorMsg(data.error ?? 'Google Maps에서 장소를 찾는 중 오류가 발생했습니다.')
      setStep('error')
      return
    }

    const matchData = await matchRes.json()
    const places = matchData.extractedPlaces ?? []
    setExtractedPlaces(places)
    setSelectedPlaceIds(
      places
        .filter((place: ExtractedPlace) => place.place)
        .map((place: ExtractedPlace) => place.id)
    )
    setStep('done')
  }, [])

  const handleSubmitUrl = useCallback(async (url: string) => {
    setErrorMsg('')
    setErrorPhase(null)
    setLoadingPhase('content')
    setCandidateCount(0)
    setSavedSelectedCount(0)
    setSavedDashboardPlaceIds([])
    setStep('saving')

    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    if (!res.ok) {
      const data = await res.json()
      setErrorPhase('content')
      setErrorMsg(data.error ?? 'URL 저장 중 오류가 발생했습니다.')
      setStep('error')
      return
    }

    const savedSource: Source & { debug?: unknown; from_cache?: boolean } = await res.json()
    setSource(savedSource)

    if (savedSource.from_cache) {
      // 캐시 히트: parse/match 생략하고 DB에서 결과 바로 로드
      setStep('loading')
      const getRes = await fetch(`/api/sources/${savedSource.id}`)
      if (!getRes.ok) {
        const data = await getRes.json()
        setErrorMsg(data.error ?? '결과를 불러오지 못했습니다.')
        setStep('error')
        return
      }
      const getData = await getRes.json()
      const places = getData.extractedPlaces ?? []
      setExtractedPlaces(places)
      setSelectedPlaceIds(
        places.filter((p: ExtractedPlace) => p.place).map((p: ExtractedPlace) => p.id),
      )
      setStep('done')
      return
    }

    await runParse(savedSource.id)
  }, [runParse])

  // sourceId 파라미터: 기존 분석 결과 불러오기
  useEffect(() => {
    if (sourceIdParam && !startedRef.current) {
      startedRef.current = true
      setStep('loading')
      ;(async () => {
        const res = await fetch(`/api/sources/${sourceIdParam}`)
        const resData = await res.json()
        if (!res.ok) {
          setErrorPhase(null)
          setErrorMsg(resData?.error ?? `콘텐츠를 불러오지 못했습니다. (${res.status})`)
          setStep('error')
          return
        }
        const { source: fetchedSource, extractedPlaces: fetchedPlaces } = resData
        setSource(fetchedSource)
        setExtractedPlaces(fetchedPlaces ?? [])
        setSelectedPlaceIds(
          (fetchedPlaces ?? [])
            .filter((ep: ExtractedPlace) => ep.place)
            .map((ep: ExtractedPlace) => ep.id)
        )
        setStep('done')
      })()
    }
  }, [sourceIdParam])

  // URL 파라미터 자동 실행 (한 번만)
  useEffect(() => {
    if (defaultUrl && !startedRef.current) {
      startedRef.current = true
      handleSubmitUrl(defaultUrl)
    }
  }, [defaultUrl, handleSubmitUrl])

  useEffect(() => {
    if (searchParams.has('new')) {
      startedRef.current = false
      resetToInput()
    }
  }, [searchParams, resetToInput])

  const handleSavePlace = async (placeId: string, sourceId: string) => {
    const res = await fetch(`/api/places/${placeId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId }),
    })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? '저장 중 오류가 발생했습니다.')
      return
    }
    setSavedDashboardPlaceIds((prev) => Array.from(new Set([...prev, placeId])))
  }

  const handleToggleSelected = (extractedPlaceId: string) => {
    setSelectedPlaceIds((prev) =>
      prev.includes(extractedPlaceId)
        ? prev.filter((id) => id !== extractedPlaceId)
        : [...prev, extractedPlaceId]
    )
  }

  const handleSaveSelected = async () => {
    if (!source) return
    const selectedPlaces = extractedPlaces.filter((ep) =>
      selectedPlaceIds.includes(ep.id) && ep.place
    )

    setSavingSelected(true)
    try {
      const responses = await Promise.all(
        selectedPlaces.map((ep) =>
          fetch(`/api/places/${ep.place!.id}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: source.id }),
          })
        )
      )
      const failed = responses.find((res) => !res.ok)
      if (failed) {
        const data = await failed.json().catch(() => ({}))
        alert(data.error ?? '선택 장소 저장 중 오류가 발생했습니다.')
        return
      }
      setSavedSelectedCount(selectedPlaces.length)
      setSavedDashboardPlaceIds(selectedPlaces.map((ep) => ep.place!.id))
      setSelectedPlaceIds([])
    } finally {
      setSavingSelected(false)
    }
  }

  const handleViewDashboard = async () => {
    if (!source) {
      router.push('/dashboard')
      return
    }

    const alreadySavedIds = new Set(savedDashboardPlaceIds)
    const selectedPlaces = extractedPlaces.filter((ep) =>
      selectedPlaceIds.includes(ep.id) && ep.place && !alreadySavedIds.has(ep.place.id)
    )

    setMovingToDashboard(true)
    try {
      if (selectedPlaces.length > 0) {
        const responses = await Promise.all(
          selectedPlaces.map((ep) =>
            fetch(`/api/places/${ep.place!.id}/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_id: source.id }),
            })
          )
        )
        const failed = responses.find((res) => !res.ok)
        if (failed) {
          const data = await failed.json().catch(() => ({}))
          alert(data.error ?? '선택 장소 저장 중 오류가 발생했습니다.')
          return
        }
      }

      const focusIds = Array.from(
        new Set([
          ...savedDashboardPlaceIds,
          ...selectedPlaces.map((ep) => ep.place!.id),
        ])
      )
      const href =
        focusIds.length > 0
          ? `/dashboard?placeIds=${encodeURIComponent(focusIds.join(','))}`
          : '/dashboard'
      router.push(href)
    } finally {
      setMovingToDashboard(false)
    }
  }

  const handleRejectPlace = async (extractedPlaceId: string) => {
    setExtractedPlaces((prev) => prev.filter((p) => p.id !== extractedPlaceId))
    setSelectedPlaceIds((prev) => prev.filter((id) => id !== extractedPlaceId))
  }

  const matchedCount = extractedPlaces.filter((p) => p.place).length
  const totalCount = extractedPlaces.length
  const matchedPlaces = extractedPlaces
    .map((ep) => ep.place)
    .filter(Boolean) as Place[]
  const selectedCount = selectedPlaceIds.length
  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      {/* 뒤로가기 */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        내 지도로
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">콘텐츠에서 장소 찾기</h1>
      <p className="text-sm text-gray-500 mb-8">
        YouTube 또는 Instagram URL을 입력하면 본문과 댓글에서 장소를 찾아 지도에 저장할 수 있습니다.
      </p>

      {/* 입력 단계 */}
      {step === 'input' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <SourceForm onSubmit={handleSubmitUrl} defaultUrl={defaultUrl} />
        </div>
      )}

      {/* 기존 결과 불러오는 중 */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-500">결과를 불러오는 중...</p>
        </div>
      )}

      {/* 저장/파싱 중 */}
      {(step === 'saving' || step === 'parsing') && (
        <div className="flex flex-col gap-4">
          {source?.thumbnail_url && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 flex items-center gap-3">
              <img
                src={source.thumbnail_url}
                alt={source.title ?? '썸네일'}
                className="w-20 h-14 object-cover rounded-md shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{source.title ?? source.url}</p>
                {source.creator && (
                  <p className="text-xs text-gray-400 mt-0.5">{source.creator}</p>
                )}
              </div>
            </div>
          )}
          <LoadingProgress phase={loadingPhase} candidateCount={candidateCount} />
        </div>
      )}

      {/* 에러 */}
      {step === 'error' && (() => {
        const errorCopy = getErrorCopy(errorPhase, errorMsg)

        return (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">{errorCopy.title}</h2>
              <p className="text-sm text-gray-500">{errorCopy.description}</p>
            </div>
          </div>
          <button
            onClick={() => { setStep('input'); setErrorMsg(''); setErrorPhase(null); setLoadingPhase('content'); setCandidateCount(0); setSource(null) }}
            className="text-sm text-blue-600 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            다시 시도
          </button>
        </div>
        )
      })()}

      {/* 완료: 추출된 장소 목록 */}
      {step === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-semibold text-gray-900">추출 완료</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  {totalCount}개 장소 추출 · Google Maps 매칭 {matchedCount}개
                </span>
                <button
                  onClick={resetToInput}
                  className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  새 콘텐츠 찾기
                </button>
              </div>
            </div>
            {source && (
              <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                {source.thumbnail_url && (
                  <img
                    src={source.thumbnail_url}
                    alt={source.title ?? '썸네일'}
                    className="w-20 h-14 object-cover rounded-md shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{source.title ?? source.url}</p>
                  {source.creator && (
                    <p className="text-xs text-gray-400 mt-0.5">{source.creator}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {extractedPlaces.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <AlertCircle className="h-6 w-6 text-gray-400" />
              </div>
              <p className="font-semibold text-gray-900 mb-2">장소 정보를 찾을 수 없어요</p>
              <p className="text-sm text-gray-500 leading-6">
                이 콘텐츠의 설명란이나 댓글에서 저장할 만한 장소 정보를 찾지 못했어요.
                <br />
                영상 화면이나 음성에만 장소가 나오는 경우는 아직 지원하지 않습니다.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={resetToInput}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  다른 콘텐츠 찾기
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  내 지도로 돌아가기
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                저장하고 싶은 장소를 선택하세요. 잘못된 장소는 &apos;제외&apos;를 누르세요.
              </p>
              {matchedPlaces.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="h-72">
                    <MapView places={matchedPlaces} height="100%" />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                    <p className="text-sm text-gray-500">
                      {savedSelectedCount > 0
                        ? `${savedSelectedCount}개 장소를 내 리스트에 저장했습니다.`
                        : `Google Maps에서 매칭된 장소 ${matchedPlaces.length}개를 지도에 표시했습니다.`}
                    </p>
                    <button
                      onClick={handleSaveSelected}
                      disabled={savingSelected || selectedCount === 0}
                      className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                    >
                      {savingSelected ? '저장 중...' : `선택한 ${selectedCount}개 저장`}
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3">
                {extractedPlaces.map((ep) => (
                  <PlaceVerifyCard
                    key={ep.id}
                    extractedPlace={ep}
                    onSave={handleSavePlace}
                    onReject={handleRejectPlace}
                    selected={selectedPlaceIds.includes(ep.id)}
                    onToggleSelected={handleToggleSelected}
                  />
                ))}
              </div>
            </>
          )}

          {extractedPlaces.length > 0 && (
            <div className="flex gap-3 mt-2">
              <button
                onClick={handleViewDashboard}
                disabled={movingToDashboard}
                className="flex-1 text-center py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
              >
                {movingToDashboard ? '저장 후 이동 중...' : '내 지도에서 확인하기'}
              </button>
              <button
                onClick={resetToInput}
                className="px-4 py-3 border border-gray-300 text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition-colors"
              >
                새 콘텐츠 찾기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function NewSourcePage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    }>
      <NewSourceContent />
    </Suspense>
  )
}
