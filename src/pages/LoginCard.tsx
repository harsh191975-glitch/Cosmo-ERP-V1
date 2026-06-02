import { useRef } from 'react'

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
// 270° arc CCW: small dot bottom-left (135°) → large dot top-right (-45°)
// Gap is 90° on the right side. Centre open ring.

// COSMO Mark v1 — canonical geometry
// R=40, SW=8, axis 38° from vertical (TR=308°, BL=128°), arc=130°, gap=50°
const CosmoLogo = () => (
  <svg width="68" height="68" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Arc 1 — lower-left, 153°→283°, 130° CW */}
    <path d="M 14.35974 68.15962 A 40 40 0 0 1 58.99804 11.02520"
      stroke="#2563EB" strokeWidth="8" strokeLinecap="round" fill="none"/>
    {/* Arc 2 — upper-right, 333°→103°, 130° CW */}
    <path d="M 85.64026 31.84038 A 40 40 0 0 1 41.00196 88.97480"
      stroke="#2563EB" strokeWidth="8" strokeLinecap="round" fill="none"/>
    {/* Center ring — r_mid=6.667, stroke=8 */}
    <circle cx="50" cy="50" r="6.66667" stroke="#2563EB" strokeWidth="8" fill="none"/>
    {/* Node TR — 308° */}
    <circle cx="74.62646" cy="18.47957" r="2.66667" stroke="#2563EB" strokeWidth="8" fill="none"/>
    {/* Node BL — 128° */}
    <circle cx="25.37354" cy="81.52043" r="2.66667" stroke="#2563EB" strokeWidth="8" fill="none"/>
  </svg>
)

// ─── LoginCard Props ──────────────────────────────────────────────────────────

export interface LoginCardProps {
  email: string
  password: string
  showPassword: boolean
  rememberMe: boolean
  loading: boolean
  errorMessage: string | null
  emailFocused: boolean
  passwordFocused: boolean
  emailRef: React.RefObject<HTMLInputElement>
  passwordRef: React.RefObject<HTMLInputElement>
  handleEmailChange: (val: string) => void
  handlePasswordChange: (val: string) => void
  handleLogin: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  setShowPassword: (val: boolean) => void
  setRememberMe: (val: boolean) => void
  setEmailFocused: (val: boolean) => void
  setPasswordFocused: (val: boolean) => void
  isDisabled: boolean
}

// ─── LoginCard Component ──────────────────────────────────────────────────────
// Pure UI card. No full-page layout, no background. Drop inside any modal/wrapper.

export default function LoginCard({
  email,
  password,
  showPassword,
  rememberMe,
  loading,
  errorMessage,
  emailFocused,
  passwordFocused,
  emailRef,
  passwordRef,
  handleEmailChange,
  handlePasswordChange,
  handleLogin,
  handleKeyDown,
  setShowPassword,
  setRememberMe,
  setEmailFocused,
  setPasswordFocused,
  isDisabled,
}: LoginCardProps) {
  return (
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
          className="text-white"
          style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: '24px', letterSpacing: '6px', textTransform: 'uppercase' }}
        >
          COSMO
        </span>
        <span className="text-xs mt-1" style={{ color: 'rgba(148,163,184,0.4)', fontFamily: "Georgia, serif", fontStyle: 'italic', letterSpacing: '0.03em' }}>
          by Harshvardhan Sharma
        </span>
      </div>

      {/* ── Heading ── */}
      <div className="mb-7 text-center">
        <h1 className="text-xl font-semibold text-white tracking-tight mb-1">
          Enter COSMO
        </h1>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.65)' }}>
          AI-driven automation • Ledger always balanced • Real-time insights
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
          'Enter COSMO'
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
  )
}
