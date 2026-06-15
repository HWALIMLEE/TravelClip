import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

type ErrorSource = 'client' | 'server'
type ErrorLevel = 'info' | 'warning' | 'error'

interface LogErrorEventInput {
  userId?: string | null
  source?: ErrorSource
  level?: ErrorLevel
  feature?: string
  action?: string
  route?: string
  message?: string
  error?: unknown
  metadata?: Record<string, unknown>
  userAgent?: string | null
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      error_name: error.name,
      stack: error.stack?.slice(0, 4000),
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
      error_name: undefined,
      stack: undefined,
    }
  }

  return {
    message: 'Unknown error',
    error_name: undefined,
    stack: undefined,
  }
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {}

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/(token|secret|password|key|authorization|cookie)/i.test(key))
      .map(([key, value]) => {
        if (typeof value === 'string') return [key, value.slice(0, 500)]
        return [key, value]
      })
  )
}

export async function logErrorEvent(input: LogErrorEventInput) {
  try {
    const serialized = serializeError(input.error)
    const headerStore = await headers().catch(() => null)
    const supabase = await createServiceClient()

    await supabase.from('error_events').insert({
      user_id: input.userId ?? null,
      source: input.source ?? 'server',
      level: input.level ?? 'error',
      feature: input.feature ?? null,
      action: input.action ?? null,
      route: input.route ?? null,
      message: input.message ?? serialized.message,
      error_name: serialized.error_name ?? null,
      stack: serialized.stack ?? null,
      metadata: sanitizeMetadata(input.metadata),
      user_agent: input.userAgent ?? headerStore?.get('user-agent') ?? null,
    })
  } catch (logError) {
    console.error('Failed to log error event:', logError)
  }
}
