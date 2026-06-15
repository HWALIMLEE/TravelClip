export interface PlaceOpeningSchedule {
  weekdayText?: string[]
  openWeekdays?: number[]
  hasOpeningHours: boolean
}

export const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayLocalDate(): string {
  return formatLocalDate(new Date())
}

export function addDays(date: string, days: number): string {
  const nextDate = parseLocalDate(date)
  nextDate.setDate(nextDate.getDate() + days)
  return formatLocalDate(nextDate)
}

export function getWeekday(date: string): number {
  return parseLocalDate(date).getDay()
}

export function getClosedWeekdays(schedule?: PlaceOpeningSchedule): number[] {
  if (!schedule?.hasOpeningHours || !schedule.openWeekdays) return []
  return WEEKDAY_LABELS.map((_, day) => day).filter((day) => !schedule.openWeekdays?.includes(day))
}

export function getClosedReasonForDate(
  schedule: PlaceOpeningSchedule | undefined,
  date: string
): string | undefined {
  if (!schedule?.hasOpeningHours || !schedule.openWeekdays) return undefined

  const weekday = getWeekday(date)
  if (schedule.openWeekdays.includes(weekday)) return undefined

  return `${WEEKDAY_LABELS[weekday]} 휴무라 이 날짜에는 배치하지 않는 것이 좋습니다.`
}

export function buildScheduleNoteForDate(
  schedule: PlaceOpeningSchedule | undefined,
  date: string,
  tripDates: string[]
): string | undefined {
  if (!schedule?.hasOpeningHours) return 'Google 영업시간 정보가 없어 휴무일은 확인하지 못했습니다.'

  const closedReason = getClosedReasonForDate(schedule, date)
  if (closedReason) return closedReason

  const closedWeekdays = getClosedWeekdays(schedule)
  if (closedWeekdays.length === 0) return 'Google 영업시간 기준으로 휴무일 충돌 없이 배치했습니다.'

  const closedDaysInTrip = tripDates
    .filter((tripDate) => closedWeekdays.includes(getWeekday(tripDate)))
    .map((tripDate) => WEEKDAY_LABELS[getWeekday(tripDate)])

  if (closedDaysInTrip.length === 0) return 'Google 영업시간 기준으로 휴무일 충돌 없이 배치했습니다.'

  return `${Array.from(new Set(closedDaysInTrip)).join(', ')} 휴무를 피해 배치했습니다.`
}
