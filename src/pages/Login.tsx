import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import LoginCard from './LoginCard'

// ─── Error message mapping ── UNCHANGED ──────────────────────────────────────
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

// ─── Global CSS injected once ─────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300;1,400&family=Sora:wght@300;400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: #020510; }

    /* ── Navbar ── */
    .cn-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 40;
      display: flex; align-items: center; justify-content: space-between;
      padding: 22px clamp(24px, 6vw, 80px);
    }
    .cn-brand { display: flex; align-items: center; gap: 12px; }
    .cn-wordmark { display: flex; flex-direction: column; line-height: 1; }
    .cn-wordmark-name {
      font-family: 'Sora', sans-serif; font-weight: 800;
      font-size: 22px; letter-spacing: 0.18em; color: #fff; text-transform: uppercase;
    }
    .cn-wordmark-by {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic; font-weight: 300; font-size: 10.5px;
      color: rgba(148,163,184,0.5); letter-spacing: 0.05em; margin-top: 3px;
    }
    .cn-navlinks {
      display: flex; align-items: center; gap: 34px;
      list-style: none; margin: 0; padding: 0;
    }
    .cn-navlinks li a {
      text-decoration: none; font-family: 'Sora', sans-serif;
      font-size: 13px; font-weight: 400; color: rgba(148,163,184,0.68);
      letter-spacing: 0.01em; transition: color 0.15s;
    }
    .cn-navlinks li a:hover { color: rgba(255,255,255,0.92); }
    .cn-nav-cta {
      font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 600;
      color: #fff; letter-spacing: 0.03em; cursor: pointer;
      padding: 9px 22px; border-radius: 100px;
      border: 1.5px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      transition: all 0.18s;
    }
    .cn-nav-cta:hover {
      background: rgba(255,255,255,0.11);
      border-color: rgba(255,255,255,0.28);
      transform: translateY(-1px);
    }

    /* ── Badge ── */
    .cn-badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px 6px 10px; border-radius: 100px;
      font-family: 'Sora', sans-serif; font-size: 10.5px; font-weight: 500;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: rgba(96,165,250,0.9);
      background: rgba(59,130,246,0.08);
      border: 1px solid rgba(59,130,246,0.22);
      margin-bottom: 26px;
    }
    .cn-badge-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #60a5fa;
      animation: cn-glow 2.4s ease-in-out infinite;
    }

    /* ── Hero ── */
    .cn-headline {
      font-family: 'Sora', sans-serif; font-weight: 800;
      font-size: clamp(46px, 5.8vw, 84px); line-height: 1.02;
      color: #fff; letter-spacing: -0.025em; margin: 0 0 6px 0;
    }
    .cn-headline-accent {
      background: linear-gradient(125deg, #4facfe 0%, #a78bfa 48%, #38bdf8 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .cn-sub {
      font-family: 'Sora', sans-serif; font-size: clamp(14px, 1.4vw, 17px);
      font-weight: 300; color: rgba(148,163,184,0.62);
      line-height: 1.72; max-width: 440px; margin: 24px 0 42px 0;
    }

    /* ── CTA group ── */
    .cn-ctas { display: flex; align-items: center; gap: 14px; }
    .cn-cta-primary {
      position: relative; overflow: hidden;
      padding: 14px 30px; border-radius: 100px;
      font-family: 'Sora', sans-serif; font-size: 14px; font-weight: 600;
      color: #fff; border: none; cursor: pointer; letter-spacing: 0.02em;
      background: linear-gradient(135deg, #1d4ed8 0%, #4f46e5 55%, #7c3aed 100%);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.1) inset,
                  0 4px 28px rgba(79,70,229,0.42);
      transition: transform 0.18s, box-shadow 0.18s;
    }
    .cn-cta-primary::before {
      content: ''; position: absolute; inset: 0; border-radius: inherit;
      background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.14) 50%, transparent 70%);
      background-size: 200% 100%;
      animation: cn-shimmer 3s linear infinite;
    }
    .cn-cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.15) inset,
                  0 8px 44px rgba(79,70,229,0.58);
    }
    .cn-cta-secondary {
      padding: 13px 26px; border-radius: 100px;
      font-family: 'Sora', sans-serif; font-size: 14px; font-weight: 500;
      color: rgba(203,213,225,0.78); cursor: pointer; letter-spacing: 0.01em;
      background: rgba(255,255,255,0.04);
      border: 1.5px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      transition: all 0.18s;
    }
    .cn-cta-secondary:hover {
      color: rgba(255,255,255,0.94);
      background: rgba(255,255,255,0.09);
      border-color: rgba(255,255,255,0.22);
      transform: translateY(-1px);
    }

    /* ── Trust strip ── */
    .cn-trust {
      display: flex; align-items: center; gap: 12px; margin-top: 48px;
      font-family: 'Sora', sans-serif; font-size: 11.5px; font-weight: 400;
      color: rgba(148,163,184,0.42);
    }
    .cn-trust-div { width: 1px; height: 13px; background: rgba(255,255,255,0.1); }

    /* ── Modal ── */
    .cn-modal-wrap {
      position: fixed; inset: 0; z-index: 50;
      display: flex; align-items: center; justify-content: center;
    }
    .cn-modal-bg {
      position: absolute; inset: 0;
      background: rgba(2,5,16,0.78);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    }
    .cn-modal-card {
      position: relative; z-index: 10;
      animation: cn-modal-in 0.26s cubic-bezier(0.16,1,0.3,1) both;
    }

    /* ── Keyframes ── */
    @keyframes cn-glow {
      0%,100% { opacity:1; box-shadow: 0 0 6px rgba(96,165,250,0.7); }
      50%      { opacity:0.4; box-shadow: 0 0 2px rgba(96,165,250,0.2); }
    }
    @keyframes cn-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position:  200% 0; }
    }
    @keyframes cn-modal-in {
      from { opacity:0; transform: scale(0.93) translateY(18px); }
      to   { opacity:1; transform: scale(1)    translateY(0); }
    }
    @keyframes cn-orbit1 {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes cn-orbit2 {
      from { transform: rotate(0deg); }
      to   { transform: rotate(-360deg); }
    }
    @keyframes cn-float {
      0%,100% { transform: translateY(0px); }
      50%      { transform: translateY(-16px); }
    }
    @keyframes cn-pulse {
      0%,100% { opacity: 0.55; }
      50%      { opacity: 1; }
    }
    @keyframes cn-fade-up {
      from { opacity:0; transform: translateY(26px); }
      to   { opacity:1; transform: translateY(0); }
    }

    .cn-hero-content { animation: cn-fade-up 0.88s cubic-bezier(0.16,1,0.3,1) 0.08s both; }

    /* ── Responsive hide navlinks ── */
    @media (max-width: 768px) {
      .cn-navlinks { display: none; }
    }
  `}</style>
)

// ─── Star Field ───────────────────────────────────────────────────────────────
const StarField = () => {
  const pts = [
    [92,64],[210,38],[355,92],[488,55],[612,120],[738,44],[852,88],[960,62],[1080,110],[1190,78],
    [1290,52],[1380,140],[44,210],[180,270],[320,190],[450,240],[575,175],[700,255],[820,200],[940,280],
    [1060,230],[1170,300],[1300,260],[1420,210],[68,380],[190,420],[310,350],[440,400],[560,375],
    [680,440],[800,360],[920,430],[1040,390],[1150,460],[1280,380],[30,540],[160,580],
    [285,510],[410,570],[535,530],[660,600],[780,555],[900,610],[1025,540],[1265,560],[1390,610],
    [80,700],[200,730],[330,670],[455,720],[580,690],[710,750],[840,700],[970,760],[1090,720],[1340,700],
    [15,160],[1440,320],[730,30],[350,760],[1200,480],[620,30],[90,580],[1380,470],
  ]
  return (
    <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
      {pts.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy}
          r={i % 6 === 0 ? 1.6 : i % 4 === 0 ? 1.1 : 0.65}
          fill="white" opacity={0.1 + (i % 9) * 0.052}
        />
      ))}
      {/* Plus sparkles */}
      {[[118,128,0.4],[1308,74,0.35],[176,648,0.3],[1108,568,0.38]].map(([x,y,op],i) => (
        <g key={`sp${i}`} transform={`translate(${x},${y})`} opacity={op}>
          <line x1="0" y1="-9" x2="0" y2="9" stroke="white" strokeWidth="0.8"/>
          <line x1="-9" y1="0" x2="9" y2="0" stroke="white" strokeWidth="0.8"/>
        </g>
      ))}
    </svg>
  )
}

// ─── Planet + Orbital Rings ───────────────────────────────────────────────────
const OrbitalVisual = () => (
  <div style={{
    position: 'absolute',
    right: 'clamp(-120px, -6vw, -60px)',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 'clamp(440px, 50vw, 800px)',
    height: 'clamp(440px, 50vw, 800px)',
    pointerEvents: 'none', userSelect: 'none',
    zIndex: 5,
  }}>
    <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width:'100%', height:'100%' }}>
      <defs>
        <radialGradient id="pBody" cx="36%" cy="30%" r="70%">
          <stop stopColor="#193068"/>
          <stop offset="0.42" stopColor="#0c1c46"/>
          <stop offset="1" stopColor="#040a1c"/>
        </radialGradient>
        <radialGradient id="pGlow" cx="50%" cy="50%" r="50%">
          <stop stopColor="#3b82f6" stopOpacity="0.32"/>
          <stop offset="0.55" stopColor="#4338ca" stopOpacity="0.1"/>
          <stop offset="1" stopColor="#4338ca" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="pAtmo" cx="50%" cy="50%" r="50%">
          <stop stopColor="#1d4ed8" stopOpacity="0.22"/>
          <stop offset="1" stopColor="#1d4ed8" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="pHL" cx="30%" cy="26%" r="44%">
          <stop stopColor="white" stopOpacity="0.08"/>
          <stop offset="1" stopColor="white" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="or1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0"/>
          <stop offset="28%"  stopColor="#60a5fa" stopOpacity="0.55"/>
          <stop offset="70%"  stopColor="#a78bfa" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="or2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0"/>
          <stop offset="40%"  stopColor="#38bdf8" stopOpacity="0.38"/>
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="or3" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0"/>
          <stop offset="50%"  stopColor="#a78bfa" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
        </linearGradient>
        <filter id="pglow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="22" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="dglow" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Outer atmospheric glow */}
      <circle cx="400" cy="400" r="290" fill="url(#pGlow)"
        style={{ animation: 'cn-pulse 6s ease-in-out infinite' }}/>
      <circle cx="400" cy="400" r="215" fill="url(#pAtmo)"
        style={{ animation: 'cn-pulse 8s ease-in-out infinite reverse' }}/>

      {/* Planet body — floats */}
      <g style={{ animation: 'cn-float 10s ease-in-out infinite', transformOrigin: '400px 400px' }}>
        <circle cx="400" cy="400" r="192" fill="url(#pBody)" filter="url(#pglow)"/>
        {/* Surface detail */}
        <ellipse cx="368" cy="358" rx="58" ry="40" fill="rgba(255,255,255,0.025)"/>
        <ellipse cx="445" cy="425" rx="36" ry="24" fill="rgba(255,255,255,0.02)"/>
        <ellipse cx="338" cy="444" rx="30" ry="19" fill="rgba(255,255,255,0.018)"/>
        {/* Highlight */}
        <circle cx="400" cy="400" r="192" fill="url(#pHL)"/>
        {/* Rim */}
        <circle cx="400" cy="400" r="192" stroke="rgba(96,165,250,0.16)" strokeWidth="1.8" fill="none"/>
      </g>

      {/* ── Ring 1 outer ── */}
      <g style={{ animation: 'cn-orbit1 30s linear infinite', transformOrigin: '400px 400px' }}>
        <ellipse cx="400" cy="400" rx="325" ry="90"
          stroke="url(#or1)" strokeWidth="1.2" strokeDasharray="9 6" fill="none" opacity="0.6"/>
        <circle cx="78" cy="396" r="7.5" fill="#60a5fa" filter="url(#dglow)"/>
        <circle cx="78" cy="396" r="4.2" fill="white" opacity="0.9"/>
      </g>

      {/* ── Ring 2 mid ── */}
      <g style={{ animation: 'cn-orbit2 19s linear infinite', transformOrigin: '400px 400px' }}>
        <ellipse cx="400" cy="400" rx="244" ry="66"
          stroke="url(#or2)" strokeWidth="1" strokeDasharray="5 5" fill="none" opacity="0.48"/>
        <circle cx="159" cy="396" r="5.8" fill="#a78bfa" filter="url(#dglow)"/>
        <circle cx="159" cy="396" r="3.2" fill="white" opacity="0.85"/>
      </g>

      {/* ── Ring 3 inner ── */}
      <g style={{ animation: 'cn-orbit1 13s linear infinite', transformOrigin: '400px 400px' }}>
        <ellipse cx="400" cy="400" rx="160" ry="43"
          stroke="url(#or3)" strokeWidth="0.8" strokeDasharray="4 4" fill="none" opacity="0.38"/>
        <circle cx="243" cy="398" r="4.2" fill="#34d399" filter="url(#dglow)"/>
        <circle cx="243" cy="398" r="2.2" fill="white" opacity="0.92"/>
      </g>

      {/* Ambient stars around planet */}
      {[
        [58,108,1.8,0.6],[724,76,1.2,0.4],[742,682,1.6,0.5],[52,664,1,0.35],
        [684,258,1.4,0.5],[96,402,1,0.3],[704,422,1.6,0.55],[382,58,1.2,0.4],
        [422,742,1,0.35],[640,120,0.9,0.28],[140,550,1.1,0.32],
      ].map(([cx,cy,r,op],i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="white" opacity={op}/>
      ))}
    </svg>
  </div>
)

// ─── Navbar ───────────────────────────────────────────────────────────────────
const Navbar = ({ onEnter }: { onEnter: () => void }) => (
  <nav className="cn-nav">
    {/* Brand */}
    <div className="cn-brand">
      {/* Logo mark */}
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
        <circle cx="19" cy="19" r="17.5" stroke="url(#lm1)" strokeWidth="1.2" strokeDasharray="3 2.5" opacity="0.5"/>
        <circle cx="19" cy="19" r="11"   stroke="url(#lm2)" strokeWidth="1.2" opacity="0.72"/>
        <circle cx="19" cy="19" r="5"    fill="url(#lm3)"/>
        <circle cx="19" cy="3"  r="2.5"  fill="#60a5fa"/>
        <circle cx="32" cy="27" r="1.8"  fill="#a78bfa" opacity="0.85"/>
        <circle cx="8"  cy="30" r="1.5"  fill="#34d399" opacity="0.75"/>
        <defs>
          <linearGradient id="lm1" x1="0" y1="0" x2="38" y2="38">
            <stop stopColor="#3b82f6"/><stop offset="1" stopColor="#8b5cf6"/>
          </linearGradient>
          <linearGradient id="lm2" x1="0" y1="0" x2="38" y2="38">
            <stop stopColor="#60a5fa"/><stop offset="1" stopColor="#a78bfa"/>
          </linearGradient>
          <radialGradient id="lm3" cx="50%" cy="50%" r="50%">
            <stop stopColor="#3b82f6"/><stop offset="1" stopColor="#7c3aed"/>
          </radialGradient>
        </defs>
      </svg>

      <div className="cn-wordmark">
        <span className="cn-wordmark-name">COSMO</span>
        <span className="cn-wordmark-by">by Harshvardhan Sharma</span>
      </div>
    </div>

    {/* Nav links */}
    <ul className="cn-navlinks">
      {['Home','Features','Use Cases','Integration','Testimonial'].map(l => (
        <li key={l}><a href="#">{l}</a></li>
      ))}
    </ul>

    {/* CTA */}
    <button className="cn-nav-cta" onClick={onEnter} type="button">
      Enter COSMO
    </button>
  </nav>
)

// ─── Hero ─────────────────────────────────────────────────────────────────────
const HeroContent = ({ onEnter }: { onEnter: () => void }) => (
  <div className="cn-hero-content" style={{ maxWidth: 560, paddingTop: 150 }}>
    {/* Badge */}
    <div className="cn-badge">
      <span className="cn-badge-dot"/>
      Trusted by forward-thinking teams
    </div>

    {/* Headline */}
    <h1 className="cn-headline">
      Run your entire<br/>
      <span className="cn-headline-accent">business in orbit.</span>
    </h1>

    {/* Subheadline */}
    <p className="cn-sub">
      COSMO is an AI-powered ERP that unifies finance, inventory, and operations
      into one intelligent system — real-time decisions, ledger always balanced.
    </p>

    {/* CTAs */}
    <div className="cn-ctas">
      <button className="cn-cta-primary" type="button" onClick={onEnter}>
        Enter COSMO →
      </button>
      <button className="cn-cta-secondary" type="button">
        Explore Features
      </button>
    </div>

    {/* Trust strip */}
    <div className="cn-trust">
      <span>AI-driven automation</span>
      <span className="cn-trust-div"/>
      <span>Ledger always balanced</span>
      <span className="cn-trust-div"/>
      <span>Real-time insights</span>
    </div>
  </div>
)

// ─── Main Login Component — ALL LOGIC UNCHANGED ───────────────────────────────
export default function Login() {
  // ── useState — UNCHANGED ───────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showLogin, setShowLogin] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const hasRedirected = useRef(false)

  // ── useEffect — UNCHANGED ──────────────────────────────────────────────────
  useEffect(() => {
    const sync = (el: HTMLInputElement | null, setter: (v: string) => void, current: string) => {
      if (el && el.value && !current) setter(el.value)
    }
    sync(emailRef.current, setEmail, email)
    sync(passwordRef.current, setPassword, password)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLogin(false)
    }
    if (showLogin) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showLogin])

  // ── Handlers — UNCHANGED ───────────────────────────────────────────────────
  const handleEmailChange = (val: string) => {
    setEmail(val)
    if (errorMessage) setErrorMessage(null)
  }
  const handlePasswordChange = (val: string) => {
    setPassword(val)
    if (errorMessage) setErrorMessage(null)
  }

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
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  const isDisabled = loading || !email || !password

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative', minHeight: '100vh', overflow: 'hidden',
      background: '#020510', fontFamily: "'Sora', sans-serif",
    }}>
      <GlobalStyles />

      {/* Deep space radial gradient */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 92% 78% at 62% 58%, #071234 0%, #040c24 38%, #020510 75%, #010208 100%)',
      }}/>

      {/* Blue rim glow at bottom-center — mimics earth limb glow */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%',
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse 75% 65% at 58% 100%, rgba(29,78,216,0.24) 0%, transparent 68%)',
      }}/>

      {/* Left edge purple wash */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '35%', height: '60%',
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at top left, rgba(67,56,202,0.08) 0%, transparent 70%)',
      }}/>

      {/* Stars */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <StarField />
      </div>

      {/* Orbital planet */}
      <OrbitalVisual />

      {/* Navbar */}
      <Navbar onEnter={() => setShowLogin(true)} />

      {/* Hero content */}
      <div style={{
        position: 'relative', zIndex: 10,
        minHeight: '100vh',
        display: 'flex', alignItems: 'center',
        paddingLeft: 'clamp(28px, 8vw, 118px)',
      }}>
        <HeroContent onEnter={() => setShowLogin(true)} />
      </div>

      {/* ── Login Modal — backdrop + card ── */}
      {showLogin && (
        <div className="cn-modal-wrap">
          <div
            className="cn-modal-bg"
            onClick={() => setShowLogin(false)}
          />
          <div className="cn-modal-card">
            <LoginCard
              email={email}
              password={password}
              showPassword={showPassword}
              rememberMe={rememberMe}
              loading={loading}
              errorMessage={errorMessage}
              emailFocused={emailFocused}
              passwordFocused={passwordFocused}
              emailRef={emailRef}
              passwordRef={passwordRef}
              handleEmailChange={handleEmailChange}
              handlePasswordChange={handlePasswordChange}
              handleLogin={handleLogin}
              handleKeyDown={handleKeyDown}
              setShowPassword={setShowPassword}
              setRememberMe={setRememberMe}
              setEmailFocused={setEmailFocused}
              setPasswordFocused={setPasswordFocused}
              isDisabled={isDisabled}
            />
          </div>
        </div>
      )}
    </div>
  )
}
