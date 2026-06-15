import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FlightSearchResult } from '@/types'

function parseTime(hhmm: string): string {
  const padded = hhmm.padStart(4, '0')
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`
}

function extractText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return match?.[1]?.trim() ?? ''
}

function parseFlightItems(xml: string): FlightSearchResult[] {
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  return itemMatches.map((item) => ({
    flightNum: extractText(item, 'internationalNum'),
    airlineKorean: extractText(item, 'airlineKorean') || undefined,
    airlineEnglish: extractText(item, 'airlineEnglish') || undefined,
    airport: extractText(item, 'airport') || undefined,
    airportCode: extractText(item, 'airportCode') || undefined,
    cityCode: extractText(item, 'cityCode') || undefined,
    scheduledTime: parseTime(extractText(item, 'internationalTime')),
    ioType: extractText(item, 'internationalIoType') as 'IN' | 'OUT',
  }))
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const flightNum = searchParams.get('flightNum')?.trim()
  const date = searchParams.get('date')?.trim()

  if (!flightNum || !date) {
    return NextResponse.json({ error: 'flightNum과 date(YYYYMMDD)가 필요합니다.' }, { status: 400 })
  }

  const apiKey = process.env.AIRPORT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AIRPORT_API_KEY 환경 변수가 설정되지 않았습니다.' }, { status: 500 })
  }

  const url = new URL('http://openapi.airport.co.kr/service/rest/FlightScheduleList/getIflightScheduleList')
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('schDate', date)
  url.searchParams.set('schFlightNum', flightNum)
  url.searchParams.set('numOfRows', '10')

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      return NextResponse.json({ error: '항공편 조회 API 호출 실패' }, { status: 502 })
    }
    const xml = await res.text()

    const resultCode = extractText(xml, 'resultCode')
    if (resultCode !== '00') {
      const resultMsg = extractText(xml, 'resultMsg')
      return NextResponse.json({ error: `API 오류: ${resultMsg}` }, { status: 502 })
    }

    const flights = parseFlightItems(xml)
    return NextResponse.json({ flights })
  } catch {
    return NextResponse.json({ error: '항공편 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
