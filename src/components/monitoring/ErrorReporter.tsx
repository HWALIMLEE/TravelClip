'use client'

import { useEffect } from 'react'

function reportClientError(payload: Record<string, unknown>) {
  const body = JSON.stringify({
    source: 'client',
    route: window.location.pathname,
    ...payload,
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/error-events', new Blob([body], { type: 'application/json' }))
    return
  }

  fetch('/api/error-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

export default function ErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      reportClientError({
        feature: 'runtime',
        action: 'window.error',
        message: event.message,
        error_name: event.error?.name ?? 'Error',
        stack: event.error?.stack,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      reportClientError({
        feature: 'runtime',
        action: 'unhandledrejection',
        message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection'),
        error_name: reason instanceof Error ? reason.name : 'UnhandledRejection',
        stack: reason instanceof Error ? reason.stack : undefined,
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
