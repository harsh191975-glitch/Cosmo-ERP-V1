import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import type { User } from '@supabase/supabase-js'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true)
  const [user, setUser]       = useState<User | null>(null)
  const navigate              = useNavigate()

  useEffect(() => {
    let mounted = true

    // ── 1. Initial session hydration ─────────────────────────────────────────
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user)
      setLoading(false)
    }

    checkUser()

    // ── 2. Reactive auth state listener ──────────────────────────────────────
    // Fires on: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, etc.
    // The SIGNED_OUT branch is the critical one: it fires immediately after
    // logoutUser() calls supabase.auth.signOut(), giving us a second,
    // independent guarantee that the user is booted — even if navigate() in
    // the sidebar somehow didn't fire (e.g. mid-render error).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        setUser(null)
        // replace: true prevents the protected page from living in history,
        // so the browser back-button cannot return to it after logout.
        navigate('/login', { replace: true })
        return
      }

      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [navigate])

  // ── Render states ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Verifying session…</span>
        </div>
      </div>
    )
  }

  if (!user) {
    // Fallback redirect for any unauthenticated render that didn't go through
    // the SIGNED_OUT event (e.g. direct URL access with no session).
    // Using useNavigate here instead of window.location keeps us inside the
    // React Router context and preserves the SPA history stack behaviour.
    navigate('/login', { replace: true })
    return null
  }

  return <>{children}</>
}
