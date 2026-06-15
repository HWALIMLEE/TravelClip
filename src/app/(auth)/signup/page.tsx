'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Eye, EyeOff, Mail, Loader2, RefreshCcw } from 'lucide-react'

function getSignupErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('rate limit')) {
    return '인증 메일 발송 요청이 잠시 많았습니다. 다른 이메일이어도 같은 서비스에서 잠시 제한될 수 있어요. 몇 분 뒤 다시 시도해주세요.'
  }

  if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already been registered')) {
    return '이미 등록된 이메일입니다. 로그인을 시도해주세요.'
  }

  return message
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const supabase = createClient()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard'

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }

    setLoading(true)

    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })

    if (authError) {
      setError(getSignupErrorMessage(authError.message))
      setLoading(false)
      return
    }

    // Supabase는 이미 가입된 이메일이어도 오류 대신 성공처럼 응답함
    // identities가 빈 배열이면 이미 가입된 계정
    if (signUpData.user?.identities?.length === 0) {
      setError('이미 가입된 이메일입니다. 로그인을 시도해주세요.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  const handleResendEmail = async () => {
    setError('')
    setResendMessage('')
    setResending(true)

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })

    if (resendError) {
      setError(getSignupErrorMessage(resendError.message))
    } else {
      setResendMessage('인증 메일을 다시 보냈습니다. 메일함을 확인해주세요.')
    }

    setResending(false)
  }

  if (success) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">이메일을 확인해주세요</h2>
            <p className="text-sm text-gray-500 leading-6">
              <span className="font-medium text-gray-700">{email}</span> 주소로 인증 메일을 보냈습니다.
              <br />
              메일 안의 링크를 누르면 TravelClip을 바로 사용할 수 있어요.
            </p>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800 mb-2">메일이 보이지 않는다면</p>
            <ul className="space-y-1.5">
              <li>스팸함이나 프로모션함을 확인해주세요.</li>
              <li>메일 주소가 맞는지 확인해주세요.</li>
              <li>잠시 후에도 오지 않으면 인증 메일을 다시 보내주세요.</li>
            </ul>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {resendMessage && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
              {resendMessage}
            </div>
          )}

          <div className="mt-6 rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700 text-center">
            이메일 링크를 클릭하면 <strong>자동으로 로그인</strong>됩니다
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleResendEmail}
              disabled={resending}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              인증 메일 다시 보내기
            </button>
            <button
              type="button"
              onClick={() => {
                setSuccess(false)
                setError('')
                setResendMessage('')
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              이메일 주소 수정하기
            </button>
            <Link
              href="/login"
              className="text-center text-xs text-gray-400 hover:text-gray-600"
            >
              이미 인증하셨나요? 로그인
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-blue-600 font-bold text-2xl">
            <MapPin className="w-7 h-7" />
            TravelClip
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">무료 회원가입</h1>
          <p className="mt-2 text-sm text-gray-500">여행 계획을 스마트하게 시작하세요</p>
        </div>

        <form
          onSubmit={handleSignup}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col gap-5"
        >
          {/* 이메일 */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          {/* 비밀번호 */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상 입력하세요"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="비밀번호 표시/숨기기"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 비밀번호 확인 */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
              비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <p className="text-xs leading-5 text-gray-400">
            가입 후 이메일 인증 메일이 발송됩니다. 짧은 시간에 여러 번 가입하거나 재전송하면
            메일 발송이 잠시 제한될 수 있어요.
          </p>

          {/* 회원가입 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-1"
          >
            {loading ? '가입 중...' : '무료 회원가입'}
          </button>

          <p className="text-center text-sm text-gray-500">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-blue-600 font-medium hover:underline">
              로그인
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
