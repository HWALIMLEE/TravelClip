import type { ParsedPlace } from '@/types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

const PLACE_EXTRACTION_PROMPT = `너는 여행 콘텐츠에서 실제 방문 가능한 장소 정보를 추출하는 AI야.

아래 텍스트는 SNS 여행 영상에서 추출된 제목, 설명, 댓글, 자막 결과야.
이 텍스트에서 실제 Google Maps에서 검색 가능한 장소 후보만 추출해.

주의사항:
- 도시명, 국가명만 단독으로 장소로 추출하지 마.
- 동네/지역/역 이름만 단독으로 장소로 추출하지 마. 예: 긴자, 아사쿠사, 우에노, 몬젠나카쵸, 츠키지.
- 음식명, 음식 장르, 목차 항목을 장소로 추출하지 마. 예: 스시, 소바, 덴푸라, 스키야키, 돈카츠, 쇼유 라멘, 츠케멘, 크레페.
- "긴자의 하이엔드 스시야", "아사쿠사의 소바 노포"처럼 지역+음식/업종만 있고 고유한 가게명이 없으면 추출하지 마.
- 구체적인 상호명, 시장명, 관광지명, 공원명, 사찰명, 박물관명, 호텔명처럼 사용자가 실제로 지도에 저장할 수 있는 고유 장소명은 추출해.
- 예: "츠키지"만 있으면 지역명이라 제외하지만, "츠키지 장외시장"처럼 특정 시장/시설이면 추출 가능해.
- 설명란에 장소가 없고 영상 화면/음성에만 있을 것으로 보이면 places를 빈 배열로 반환해.
- 일반 명사만 있는 경우 confidence를 낮게 설정해(0.3 이하).
- 음식명과 장소명을 구분해.
- 확실하지 않은 장소는 reason에 불확실성을 적어.
- 반드시 JSON 객체로만 출력해. 다른 텍스트는 절대 포함하지 마.

출력 형식:
{
  "places": [
    {
      "raw_name": "장소명",
      "category": "restaurant|cafe|attraction|shopping|hotel|transport|park|museum|other",
      "city_hint": "도시명",
      "area_hint": "지역명/동네명",
      "evidence_text": "텍스트에서 해당 장소가 언급된 문장",
      "reason": "이 장소를 추출한 이유",
      "confidence": 0.0~1.0,
      "needs_reservation": true|false
    }
  ]
}`

const ITINERARY_PROMPT = `너는 여행 동선 최적화 전문가야.
사용자의 저장 장소 목록과 여행 조건을 바탕으로 현실적인 여행 일정을 생성해.

고려사항:
- 같은 지역끼리 묶기
- 식사 시간(12:00~13:30, 18:00~19:30)에는 식당/카페 배치
- 카페/휴식 장소는 오전/오후 중간에 배치
- 하루 이동 동선이 너무 길어지지 않게 하기
- 예약이 필요한 장소는 별도 표시
- 사용자가 꼭 가고 싶은 장소는 우선 배치
- 각 날의 장소는 반드시 시간 오름차순으로 나열할 것. places 배열의 첫 번째 항목이 가장 이른 시간, 마지막 항목이 가장 늦은 시간이어야 함. 예: [{time:"10:00",...}, {time:"13:00",...}, {time:"16:00",...}] — 절대로 [{time:"16:00",...}, {time:"10:00",...}] 같은 역순 배치 금지.
- 반드시 JSON 객체로만 출력해. 다른 텍스트는 절대 포함하지 마.

출력 형식:
{
  "title": "여행 제목",
  "itinerary": [
    {
      "day": 1,
      "theme": "지역 테마",
      "places": [
        {
          "place_id": "uuid",
          "name": "장소명",
          "time": "HH:MM",
          "duration_minutes": 90,
          "transport_method": "walk|train|bus|taxi|null",
          "travel_minutes": 0
        }
      ]
    }
  ]
}`

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[]
  error?: { type?: string; message?: string }
}

export class AnthropicApiError extends Error {
  status: number
  type?: string

  constructor(message: string, status: number, type?: string) {
    super(message)
    this.name = 'AnthropicApiError'
    this.status = status
    this.type = type
  }
}

async function createClaudeMessage({
  system,
  prompt,
  temperature,
  maxTokens,
}: {
  system: string
  prompt: string
  temperature: number
  maxTokens: number
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = (await res.json().catch(() => ({}))) as AnthropicResponse
  if (!res.ok) {
    const apiMessage = data.error?.message ?? 'Claude API request failed'
    const friendlyMessage =
      res.status === 403 && /request not allowed/i.test(apiMessage)
        ? 'Anthropic API 요청이 거부되었습니다. Cloudflare 배포 환경의 실행 지역이나 네트워크가 Anthropic에서 허용되지 않았을 수 있습니다.'
        : apiMessage

    throw new AnthropicApiError(friendlyMessage, res.status, data.error?.type)
  }

  return data.content
    ?.filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim() ?? null
}

function parseJson<T>(content: string | null): T | null {
  if (!content) return null

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null

    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T
    } catch {
      return null
    }
  }
}

export async function extractPlacesFromText(text: string): Promise<ParsedPlace[]> {
  const content = await createClaudeMessage({
    system: PLACE_EXTRACTION_PROMPT,
    prompt: text,
    temperature: 0.2,
    maxTokens: 8192,
  })

  const parsed = parseJson<{ places?: ParsedPlace[] } | ParsedPlace[]>(content)
  const places = Array.isArray(parsed) ? parsed : parsed?.places ?? []
  return places.filter((p) => p.confidence >= 0.4)
}

interface ItineraryPlace {
  id: string
  name: string
  category?: string
  lat?: number
  lng?: number
  area?: string
  schedule?: string
  needs_reservation?: boolean
}

interface GeneratedItineraryItem {
  place_id: string
  name: string
  time: string
  duration_minutes: number
  transport_method: string | null
  travel_minutes: number
}

interface GeneratedItineraryDay {
  day: number
  theme: string
  places: GeneratedItineraryItem[]
}

export interface GeneratedItinerary {
  title: string
  itinerary: GeneratedItineraryDay[]
}

interface FlightConstraint {
  flightNum: string
  airlineKorean?: string
  airport?: string
  scheduledTime: string
  ioType: 'IN' | 'OUT'
}

export async function generateItinerary(
  places: ItineraryPlace[],
  options: {
    city: string
    days: number
    startDate?: string
    tripDates?: string[]
    baseLocation?: string
    travelStyle?: string[]
    departureFlight?: FlightConstraint
    returnFlight?: FlightConstraint
  }
): Promise<GeneratedItinerary | null> {
  const placesText = places
    .map((p) => {
      const coordinates = p.lat && p.lng ? `, 좌표: ${p.lat},${p.lng}` : ''
      const schedule = p.schedule ? `, 영업/휴무 참고: ${p.schedule}` : ''
      return `- id: ${p.id}, 이름: ${p.name}, 카테고리: ${p.category ?? '?'}, 지역: ${p.area ?? '?'}${coordinates}${schedule}`
    })
    .join('\n')

  const flightLines: string[] = []
  if (options.departureFlight) {
    const f = options.departureFlight
    const direction = f.ioType === 'OUT'
      ? `한국 공항 ${f.scheduledTime} 출발 → ${f.airport ?? '목적지'} 도착`
      : `${f.airport ?? '출발지'} → 한국 공항 ${f.scheduledTime} 도착`
    flightLines.push(`- 출발편 (${f.flightNum}${f.airlineKorean ? ` · ${f.airlineKorean}` : ''}): ${direction}`)
    if (f.ioType === 'OUT') {
      flightLines.push(`  → Day 1은 출발 시간(${f.scheduledTime}) 이전 일정은 불가. 공항 이동 시간 2~3시간 감안.`)
    } else {
      flightLines.push(`  → Day 1은 도착 시간(${f.scheduledTime}) 이후부터 관광 시작.`)
    }
  }
  if (options.returnFlight) {
    const f = options.returnFlight
    const lastDay = options.days + 1
    if (f.ioType === 'IN') {
      // scheduledTime = 한국 공항 도착 시각. 현지 출발은 비행 시간(약 2~3시간) 전.
      const [hh] = f.scheduledTime.split(':').map(Number)
      flightLines.push(`- 귀국편 (${f.flightNum}${f.airlineKorean ? ` · ${f.airlineKorean}` : ''}): ${f.airport ?? '목적지'} 출발 → 한국 공항 ${f.scheduledTime} 도착`)
      if (hh < 15) {
        flightLines.push(`  → 한국 도착 ${f.scheduledTime} 기준 현지 공항 출발은 약 ${f.scheduledTime} 2~3시간 전 → 이른 아침 출발 필요.`)
        flightLines.push(`  → 마지막 날(Day ${lastDay})은 places를 반드시 빈 배열 []로 설정. 관광 일정 절대 배치 금지.`)
      } else {
        flightLines.push(`  → 마지막 날(Day ${lastDay})은 오전 가벼운 일정만 가능, 점심 전에 마무리.`)
      }
    } else {
      // ioType === 'OUT': 귀국편인데 한국 출발? 일반적이지 않지만 도착 후 일정 제한.
      flightLines.push(`- 귀국편 (${f.flightNum}${f.airlineKorean ? ` · ${f.airlineKorean}` : ''}): 한국 공항 ${f.scheduledTime} 출발`)
      flightLines.push(`  → 마지막 날(Day ${lastDay})은 도착 후 가벼운 일정만 가능.`)
    }
  }

  const flightSection = flightLines.length > 0
    ? `\n항공 일정 (반드시 아래 시간 제약을 지켜서 일정 생성):\n${flightLines.join('\n')}\n`
    : ''

  const userPrompt = `
도시: ${options.city}
여행 기간: ${options.days}박 ${options.days + 1}일
여행 시작일: ${options.startDate ?? '미정'}
여행 날짜: ${options.tripDates?.join(', ') ?? '미정'}
숙소 기준: ${options.baseLocation ?? '미정'}
여행 스타일: ${options.travelStyle?.join(', ') ?? '일반'}
${flightSection}
저장된 장소 목록:
${placesText}

위 장소들을 바탕으로 ${options.days + 1}일 여행 일정을 만들어줘.
중요:
- 영업/휴무 참고에 특정 요일 휴무가 있으면 그 요일에는 해당 장소를 배치하지 마.
- 좌표가 있는 장소는 같은 지역끼리 묶고, 위도/경도가 가까운 장소를 같은 날에 배치해.
- 이동 시간이 과도하지 않게 동선을 짜고, 이동수단과 예상 이동 시간을 적어.
- 항공 일정이 있으면 해당 제약 시간을 반드시 지켜.`

  const content = await createClaudeMessage({
    system: ITINERARY_PROMPT,
    prompt: userPrompt,
    temperature: 0.3,
    maxTokens: 4096,
  })

  return parseJson<GeneratedItinerary>(content)
}
