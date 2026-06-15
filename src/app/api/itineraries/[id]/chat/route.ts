import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const CHAT_SYSTEM_PROMPT = `너는 여행 일정 수정 도우미야.
사용자가 자연어로 요청하면 현재 일정을 분석해서 적절한 수정 작업을 만들어.

규칙:
- 반드시 JSON만 출력해. 다른 텍스트는 절대 포함하지 마.
- reply는 친근한 한국어로 작성해. 어떤 변경을 했는지 간략히 설명해.
- 수정이 없으면 update_items: [], delete_item_ids: [], new_title: null로 반환하고 reply만 작성해.
- 장소를 다른 날로 이동할 때는 원래 날의 남은 아이템 order_index를 1부터 재배치해.
- 날짜 언급이 없으면 문맥상 가장 적절한 날에 배치해.
- start_time, duration_minutes, transport_method, travel_minutes는 변경이 필요한 경우에만 포함해.

출력 형식:
{
  "reply": "변경 내용 설명",
  "update_items": [
    { "id": "uuid", "day": 1, "order_index": 1, "start_time": "HH:MM", "duration_minutes": 90, "transport_method": "walk", "travel_minutes": 10 }
  ],
  "delete_item_ids": ["uuid"],
  "new_title": "새 제목 또는 null"
}`

interface ChatRequestBody {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

interface ClaudeResponse {
  reply: string
  update_items?: Array<{
    id: string
    day?: number
    order_index?: number
    start_time?: string
    duration_minutes?: number
    transport_method?: string
    travel_minutes?: number
  }>
  delete_item_ids?: string[]
  new_title?: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as ChatRequestBody | null
  if (!body?.message?.trim()) {
    return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()

  const { data: itinerary } = await serviceSupabase
    .from('itineraries')
    .select('*')
    .eq('id', id)
    .single()

  if (!itinerary) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })

  const canEdit =
    itinerary.user_id === user.id ||
    (await serviceSupabase
      .from('itinerary_collaborators')
      .select('role')
      .eq('itinerary_id', id)
      .eq('user_id', user.id)
      .eq('role', 'editor')
      .maybeSingle()
      .then(({ data }) => !!data))

  if (!canEdit) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  const { data: items } = await serviceSupabase
    .from('itinerary_items')
    .select('*, place:places(id, name, category, address)')
    .eq('itinerary_id', id)
    .order('day', { ascending: true })
    .order('order_index', { ascending: true })

  const dayLines = Object.entries(
    (items ?? []).reduce<Record<number, typeof items>>((acc, item) => {
      if (!item) return acc
      if (!acc[item.day]) acc[item.day] = []
      acc[item.day]!.push(item)
      return acc
    }, {})
  )
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, dayItems]) => {
      const itemLines = dayItems!
        .map((item) => {
          const time = item.start_time ? ` 시작: ${item.start_time.slice(0, 5)}` : ''
          const dur = item.duration_minutes ? ` 체류: ${item.duration_minutes}분` : ''
          const transport = item.transport_method ? ` 이동: ${item.transport_method} ${item.travel_minutes ?? 0}분` : ''
          return `  ${item.order_index}. ${item.place?.name ?? '장소 없음'} [id: ${item.id}] (${item.place?.category ?? '?'})${time}${dur}${transport}`
        })
        .join('\n')
      return `Day ${day}:\n${itemLines}`
    })
    .join('\n\n')

  const itineraryContext = `현재 일정:
제목: ${itinerary.title}
도시: ${itinerary.city ?? '미정'}
시작일: ${itinerary.start_date ?? '미정'}

${dayLines}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI 서비스를 사용할 수 없습니다.' }, { status: 500 })

  const history = (body.history ?? []).slice(-20)

  const messages = [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: itineraryContext, cache_control: { type: 'ephemeral' as const } }],
    },
    { role: 'assistant' as const, content: '알겠습니다. 무엇을 수정할까요?' },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: body.message },
  ]

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.2,
      system: [{ type: 'text', text: CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  })

  if (!claudeRes.ok) {
    return NextResponse.json({ error: 'AI 응답을 받지 못했습니다.' }, { status: 502 })
  }

  const claudeData = await claudeRes.json()
  const rawText: string =
    claudeData.content
      ?.filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('') ?? ''

  let parsed: ClaudeResponse | null = null
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    const start = rawText.indexOf('{')
    const end = rawText.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(rawText.slice(start, end + 1))
      } catch {
        /* empty */
      }
    }
  }

  if (!parsed) {
    return NextResponse.json({ reply: rawText || 'AI 응답을 처리하지 못했습니다.' })
  }

  const opsApplied: string[] = []

  if (parsed.update_items?.length) {
    const updates = parsed.update_items.map((u) => ({
      id: u.id,
      ...(u.day != null && { day: u.day }),
      ...(u.order_index != null && { order_index: u.order_index }),
      ...(u.start_time != null && { start_time: u.start_time }),
      ...(u.duration_minutes != null && { duration_minutes: u.duration_minutes }),
      ...(u.transport_method != null && { transport_method: u.transport_method }),
      ...(u.travel_minutes != null && { travel_minutes: u.travel_minutes }),
    }))

    for (const update of updates) {
      const { id: itemId, ...patch } = update
      await serviceSupabase.from('itinerary_items').update(patch).eq('id', itemId).eq('itinerary_id', id)
    }
    opsApplied.push(`${updates.length}개 항목 수정`)
  }

  if (parsed.delete_item_ids?.length) {
    await serviceSupabase
      .from('itinerary_items')
      .delete()
      .in('id', parsed.delete_item_ids)
      .eq('itinerary_id', id)
    opsApplied.push(`${parsed.delete_item_ids.length}개 항목 삭제`)
  }

  if (parsed.new_title) {
    await serviceSupabase
      .from('itineraries')
      .update({ title: parsed.new_title })
      .eq('id', id)
    opsApplied.push('제목 변경')
  }

  return NextResponse.json({
    reply: parsed.reply ?? '완료됐습니다.',
    ops_applied: opsApplied,
  })
}
