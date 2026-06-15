import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logErrorEvent } from '@/lib/error-logger'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const body = await request.json().catch(() => ({}))
  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : 'Client error'
  const error = new Error(message)
  error.name = typeof body.error_name === 'string' ? body.error_name : 'ClientError'
  error.stack = typeof body.stack === 'string' ? body.stack : undefined

  await logErrorEvent({
    userId: user?.id ?? null,
    source: 'client',
    level: body.level === 'warning' || body.level === 'info' ? body.level : 'error',
    feature: typeof body.feature === 'string' ? body.feature : 'client',
    action: typeof body.action === 'string' ? body.action : undefined,
    route: typeof body.route === 'string' ? body.route : request.nextUrl.pathname,
    message,
    error,
    metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true })
}
