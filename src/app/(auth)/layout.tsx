import { Suspense } from 'react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <div className="flex-1 flex flex-col">{children}</div>
    </Suspense>
  )
}
