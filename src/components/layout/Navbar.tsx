'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Menu, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [supabase.auth])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navLinks = user
    ? [
        { href: '/sources/new?new=1', activeHref: '/sources/new', label: '콘텐츠 장소 찾기' },
        { href: '/dashboard', label: '내 지도' },
        { href: '/itinerary', label: '내 일정' },
        { href: '/itinerary/builder', label: '일정 만들기' },
      ]
    : []

  const ADMIN_EMAIL = 'hwalim9612@gmail.com'

  const secondaryLinks = user
    ? [
        { href: '/sources', label: '저장한 콘텐츠' },
        { href: '/mypage', label: '마이페이지' },
        ...(user.email === ADMIN_EMAIL ? [{ href: '/admin', label: '피드 관리' }] : []),
      ]
    : []

  const isActive = (href: string) => {
    if (href === '/itinerary') {
      return pathname === '/itinerary' || /^\/itinerary\/(?!builder(?:\/|$))[^/]+$/.test(pathname)
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  const publicNavLinks = [
    { href: '/#feed', label: '인기 일정' },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white shrink-0">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-white" />
            </div>
            <span>TravelClip</span>
          </Link>

          {/* 데스크탑 네비게이션 */}
          <div className="hidden md:flex items-center gap-6">
            {publicNavLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                target="_self"
                className={`text-sm font-medium transition-colors ${
                  isActive(link.activeHref ?? link.href)
                    ? 'text-blue-400'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* 데스크탑 인증 버튼 */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                {secondaryLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-sm font-medium transition-colors ${
                      isActive(link.href) ? 'text-blue-400' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <button
                  onClick={handleLogout}
                  className="px-4 py-1.5 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-1.5 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  로그인
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  무료 시작
                </Link>
              </>
            )}
          </div>

          {/* 모바일 메뉴 버튼 */}
          <button
            type="button"
            className="md:hidden flex items-center justify-center w-12 h-12 -mr-2 text-gray-400 hover:text-white transition-colors touch-manipulation"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="메뉴"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900 px-4 py-4 flex flex-col gap-4">
          {publicNavLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-gray-300"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              target="_self"
              className={`text-sm font-medium ${
                isActive(link.activeHref ?? link.href) ? 'text-blue-400' : 'text-gray-300'
              }`}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {secondaryLinks.length > 0 && (
            <div className="border-t border-gray-800 pt-2 flex flex-col gap-3">
              {secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium ${
                    isActive(link.href) ? 'text-blue-400' : 'text-gray-400'
                  }`}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
          {user ? (
            <button
              onClick={() => {
                setMenuOpen(false)
                handleLogout()
              }}
              className="text-left text-sm text-gray-500 border-t border-gray-800 pt-2"
            >
              로그아웃
            </button>
          ) : (
            <div className="flex gap-3 pt-2">
              <Link
                href="/login"
                className="flex-1 text-center py-2 text-sm text-gray-300 border border-gray-600 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                로그인
              </Link>
              <Link
                href="/signup"
                className="flex-1 text-center py-2 text-sm text-white bg-blue-600 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                무료 시작
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
