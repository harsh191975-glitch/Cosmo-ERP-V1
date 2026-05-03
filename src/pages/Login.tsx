import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 7l10 7 10-7" />
  </svg>
)

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

// ─── COSMO Logo Mark ─────────────────────────────────────────────────────────

const CosmoLogo = () => (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="26" r="25" stroke="url(#logoRing)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
    <circle cx="26" cy="26" r="16" stroke="url(#logoRing2)" strokeWidth="1.5" opacity="0.6" />
    <circle cx="26" cy="26" r="7" fill="url(#logoDot)" />
    {/* Orbital dots */}
    <circle cx="26" cy="10" r="2.5" fill="#60a5fa" />
    <circle cx="42" cy="26" r="2" fill="#a78bfa" opacity="0.8" />
    <circle cx="14" cy="38" r="1.5" fill="#34d399" opacity="0.7" />
    <defs>
      <linearGradient id="logoRing" x1="0" y1="0" x2="52" y2="52">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
      <linearGradient id="logoRing2" x1="0" y1="0" x2="52" y2="52">
        <stop stopColor="#60a5fa" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
      <radialGradient id="logoDot" cx="50%" cy="50%" r="50%">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#7c3aed" />
      </radialGradient>
    </defs>
  </svg>
)

// ─── Background: Stars + Orbital Planet ──────────────────────────────────────

const BackgroundScene = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
    {/* Deep gradient base */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_70%_60%,#0d1a3a_0%,#06091a_60%,#020409_100%)]" />

    {/* Stars — scattered dots */}
    <svg className="absolute inset-0 w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
      {[
        [120, 80], [240, 140], [380, 60], [510, 200], [640, 90],
        [760, 170], [880, 50], [970, 220], [1050, 130], [1150, 80],
        [1220, 300], [80, 320], [200, 400], [350, 280], [490, 370],
        [620, 420], [750, 310], [900, 380], [1040, 450], [1180, 360],
        [160, 500], [310, 560], [460, 490], [600, 570], [730, 530],
        [860, 490], [1000, 550], [1130, 510], [1260, 470],
        [90, 650], [270, 700], [420, 630], [570, 720], [700, 660],
        [830, 710], [960, 640], [1100, 690], [1230, 620],
        [1300, 150], [1350, 400], [1380, 600], [1410, 250], [1440, 500],
        [50, 180], [30, 450], [15, 700],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i % 5 === 0 ? 1.5 : i % 3 === 0 ? 1 : 0.7}
          fill="white"
          opacity={0.2 + (i % 7) * 0.08}
        />
      ))}
    </svg>

    {/* Planet + orbits — right side */}
    <div className="absolute right-[-60px] bottom-[-80px] w-[620px] h-[620px] opacity-90">
      <svg viewBox="0 0 620 620" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Glow halo */}
        <circle cx="340" cy="400" r="200" fill="url(#planetGlow)" opacity="0.18" />

        {/* Planet body */}
        <circle cx="340" cy="400" r="160" fill="url(#planetBody)" />
        {/* Planet surface shimmer */}
        <ellipse cx="300" cy="360" rx="60" ry="80" fill="white" opacity="0.03" />

        {/* Outer orbit ring */}
        <ellipse cx="340" cy="400" rx="280" ry="80" stroke="url(#orbitGrad1)" strokeWidth="1" strokeDasharray="6 5" opacity="0.35" />
        {/* Inner orbit ring */}
        <ellipse cx="340" cy="400" rx="200" ry="55" stroke="url(#orbitGrad2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />

        {/* Orbital satellite dots */}
        <circle cx="90" cy="375" r="5" fill="#60a5fa" opacity="0.9" />
        <circle cx="200" cy="330" r="3.5" fill="#a78bfa" opacity="0.8" />
        <circle cx="590" cy="425" r="4" fill="#34d399" opacity="0.7" />
        <circle cx="500" cy="350" r="2.5" fill="#60a5fa" opacity="0.6" />

        <defs>
          <radialGradient id="planetGlow" cx="50%" cy="50%" r="50%">
            <stop stopColor="#3b82f6" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="planetBody" cx="35%" cy="35%" r="65%">
            <stop stopColor="#1e3a6e" />
            <stop offset="0.5" stopColor="#0f2044" />
            <stop offset="1" stopColor="#080f22" />
          </radialGradient>
          <linearGradient id="orbitGrad1" x1="60" y1="400" x2="620" y2="400">
            <stop stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="0.3" stopColor="#60a5fa" />
            <stop offset="0.7" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="orbitGrad2" x1="140" y1="400" x2="540" y2="400">
            <stop stopColor="#60a5fa" stopOpacity="0" />
            <stop offset="0.4" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    {/* Subtle top-left nebula wash */}
    <div className="absolute top-0 left-0 w-[500px] h-[400px] bg-[radial-gradient(ellipse_at_top_left,#1e3a8a18_0%,transparent_70%)]" />
  </div>
)

// ─── Error message mapping ────────────────────────────────────────────────────
// Maps raw Supabase error messages to clean, user-facing copy.
// Falls back to a generic message so raw API text never surfaces.
function mapAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid email or password'))
    return 'Incorrect email or password. Please try again.'
  if (m.includes('email not confirmed'))
    return 'Please verify your email address before signing in.'
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.'
  if (m.includes('user not found'))
    return 'No account found with that email address.'
  if (m.includes('network') || m.includes('fetch'))
    return 'Network error. Please check your connection and try again.'
  return 'Something went wrong. Please try again.'
}

// ─── Main Login Component ─────────────────────────────────────────────────────

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const hasRedirected = useRef(false)

  // ── Autofill sync on mount ────────────────────────────────────────────────
  // Only syncs if the React state is still empty — prevents overwriting
  // anything the user may have already typed before the effect runs.
  useEffect(() => {
    const sync = (el: HTMLInputElement | null, setter: (v: string) => void, current: string) => {
      if (el && el.value && !current) setter(el.value)
    }
    sync(emailRef.current, setEmail, email)
    sync(passwordRef.current, setPassword, password)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auth listener: session redirect (with cleanup) ────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session
      ) {
        if (!hasRedirected.current) {
          hasRedirected.current = true
          window.location.href = '/'
        }
      }
    })
    // Unsubscribe on unmount — prevents memory leaks and duplicate redirects
    return () => subscription.unsubscribe()
  }, [])

  // ── Input change handlers (clear stale error on new input) ────────────────
  const handleEmailChange = (val: string) => {
    setEmail(val)
    if (errorMessage) setErrorMessage(null)
  }
  const handlePasswordChange = (val: string) => {
    setPassword(val)
    if (errorMessage) setErrorMessage(null)
  }

  // ── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    const trimmedPassword = password.trim()
    if (!normalizedEmail || !trimmedPassword) return
    if (submitting.current || loading) return

    submitting.current = true
    setLoading(true)
    setErrorMessage(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: trimmedPassword,
      })

      if (error) {
        setPassword('')
        setErrorMessage(mapAuthError(error.message))
        requestAnimationFrame(() => emailRef.current?.focus())
      }
      // On success, onAuthStateChange SIGNED_IN handles the redirect
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  const isDisabled = loading || !email || !password

  return (
    <div className="relative min-h-screen w-full flex items-center overflow-hidden font-sans">
      {/* ── Background ── */}
      <BackgroundScene />

      {/* ── Layout: card on the left ~40%, open space on right ── */}
      <div className="relative z-10 w-full flex items-center justify-start px-8 sm:px-16 lg:px-24 xl:px-32">
        {/* ── Login Card ── */}
        <div
          className="w-full max-w-[420px] rounded-2xl p-8 sm:p-10"
          style={{
            background: 'rgba(8, 15, 35, 0.72)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          {/* ── Logo ── */}
          <div className="flex flex-col items-center mb-7">
            <div className="mb-3">
              <CosmoLogo />
            </div>
            <span
              className="text-2xl font-bold tracking-widest text-white"
              style={{ letterSpacing: '0.18em', fontFamily: "'Trebuchet MS', sans-serif" }}
            >
              COSMO
            </span>
            <span className="text-xs mt-1" style={{ color: 'rgba(148,163,184,0.7)', fontStyle: 'italic', letterSpacing: '0.04em' }}>
              by Harshvardhan Sharma
            </span>
          </div>

          {/* ── Heading ── */}
          <div className="mb-7 text-center">
            <h1 className="text-xl font-semibold text-white tracking-tight mb-1">
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: 'rgba(148,163,184,0.65)' }}>
              Sign in to continue to your COSMO ERP account
            </p>
          </div>

          {/* ── Inputs ── */}
          <div className="space-y-3">
            {/* Email */}
            <div
              className="flex items-center gap-3 rounded-xl px-4 h-12 transition-all duration-200"
              style={{
                background: 'rgba(15, 25, 55, 0.7)',
                border: emailFocused
                  ? '1px solid rgba(96,165,250,0.6)'
                  : '1px solid rgba(255,255,255,0.07)',
                boxShadow: emailFocused ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
              }}
            >
              <span style={{ color: emailFocused ? 'rgba(96,165,250,0.9)' : 'rgba(100,116,139,0.8)' }} className="transition-colors duration-200 flex-shrink-0">
                <MailIcon />
              </span>
              <input
                ref={emailRef}
                type="email"
                placeholder="Email or Phone Number"
                value={email}
                onChange={e => handleEmailChange(e.target.value)}
                onInput={e => handleEmailChange((e.target as HTMLInputElement).value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500 text-white"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div
              className="flex items-center gap-3 rounded-xl px-4 h-12 transition-all duration-200"
              style={{
                background: 'rgba(15, 25, 55, 0.7)',
                border: passwordFocused
                  ? '1px solid rgba(96,165,250,0.6)'
                  : '1px solid rgba(255,255,255,0.07)',
                boxShadow: passwordFocused ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
              }}
            >
              <span style={{ color: passwordFocused ? 'rgba(96,165,250,0.9)' : 'rgba(100,116,139,0.8)' }} className="transition-colors duration-200 flex-shrink-0">
                <LockIcon />
              </span>
              <input
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => handlePasswordChange(e.target.value)}
                onInput={e => handlePasswordChange((e.target as HTMLInputElement).value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500 text-white"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="flex-shrink-0 transition-colors duration-200"
                style={{ color: showPassword ? 'rgba(96,165,250,0.85)' : 'rgba(100,116,139,0.6)' }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* ── Inline error message ── */}
          {errorMessage && (
            <p
              role="alert"
              className="text-xs mt-3 text-center"
              style={{ color: 'rgba(248,113,113,0.9)' }}
            >
              {errorMessage}
            </p>
          )}

          {/* ── Remember me + Forgot password ── */}
          <div className="flex items-center justify-between mt-4 mb-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded flex items-center justify-center transition-all duration-150"
                  style={{
                    background: rememberMe ? 'rgba(59,130,246,0.85)' : 'transparent',
                    border: rememberMe ? '1px solid rgba(96,165,250,0.8)' : '1px solid rgba(100,116,139,0.4)',
                  }}
                >
                  {rememberMe && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>Remember me</span>
            </label>

            <button
              type="button"
              className="text-xs font-medium transition-colors duration-150 hover:text-blue-300"
              style={{ color: 'rgba(96,165,250,0.85)' }}
            >
              Forgot password?
            </button>
          </div>

          {/* ── Sign In Button ── */}
          <button
            type="button"
            onClick={handleLogin}
            disabled={isDisabled}
            className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2"
            style={{
              background: isDisabled
                ? 'rgba(59,130,246,0.35)'
                : 'linear-gradient(135deg, #2563eb 0%, #6d28d9 100%)',
              opacity: isDisabled ? 0.6 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              boxShadow: isDisabled
                ? 'none'
                : '0 4px 20px rgba(59,130,246,0.25), 0 1px 0 rgba(255,255,255,0.1) inset',
              transform: 'translateY(0)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => {
              if (!isDisabled) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(59,130,246,0.35), 0 1px 0 rgba(255,255,255,0.1) inset'
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = isDisabled
                ? 'none'
                : '0 4px 20px rgba(59,130,246,0.25), 0 1px 0 rgba(255,255,255,0.1) inset'
            }}
          >
            {loading ? (
              <>
                <SpinnerIcon />
                <span>Signing in…</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>

          {/* ── Footer ── */}
          <p className="text-center text-xs mt-6" style={{ color: 'rgba(100,116,139,0.7)' }}>
            Don't have an account?{' '}
            <button
              type="button"
              className="font-medium transition-colors duration-150 hover:text-blue-300"
              style={{ color: 'rgba(96,165,250,0.85)' }}
            >
              Create account
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
