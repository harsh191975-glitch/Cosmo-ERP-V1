import { useEffect, useRef, useState } from 'react'

/* ─── Intersection Observer hook — fade-up on scroll ─────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.18 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

const revealStyle = (visible: boolean, delay = 0): React.CSSProperties => ({
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateY(0)' : 'translateY(40px)',
  transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${delay}s, transform 0.7s cubic-bezier(.16,1,.3,1) ${delay}s`,
})

/* ─── Section wrapper ────────────────────────────────────────────────────── */
const Section = ({ children, style, id }: {
  children: React.ReactNode; style?: React.CSSProperties; id?: string
}) => (
  <section id={id} style={{
    position: 'relative', width: '100%',
    padding: 'clamp(80px, 12vh, 140px) clamp(24px, 8vw, 120px)',
    ...style,
  }}>
    {children}
  </section>
)

/* ─── Animated counter ───────────────────────────────────────────────────── */
function AnimCounter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0)
  const r = useReveal()
  useEffect(() => {
    if (!r.visible) return
    let frame: number; let start: number | null = null
    const dur = 1600
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setVal(Math.floor(p * target))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [r.visible, target])
  return (
    <div ref={r.ref} style={revealStyle(r.visible)}>
      <div style={{
        fontFamily: "'Sora', sans-serif", fontWeight: 700,
        fontSize: 'clamp(32px, 4vw, 52px)', color: '#fff',
        background: 'linear-gradient(125deg, #60a5fa 0%, #a78bfa 60%, #38bdf8 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>
        {prefix}{val.toLocaleString()}{suffix}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1 — Metrics Trust Strip
   ═══════════════════════════════════════════════════════════════════════════ */
export function MetricsStrip() {
  const r = useReveal()
  const metrics = [
    { target: 10000, suffix: '+', label: 'Transactions Processed' },
    { target: 100, suffix: '%', label: 'Double-Entry Integrity' },
    { target: 50, suffix: '+', label: 'Expense Categories' },
    { target: 0, suffix: '', prefix: 'AI', label: 'AI-powered operational intelligence', isText: true },
  ]
  return (
    <Section style={{ background: 'linear-gradient(180deg, #020510 0%, #060d24 100%)' }}>
      <div ref={r.ref} style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '40px', textAlign: 'center', maxWidth: 1000, margin: '0 auto',
      }}>
        {metrics.map((m, i) => (
          <div key={i} style={revealStyle(r.visible, i * 0.12)}>
            {m.isText ? (
              <div style={{
                fontFamily: "'Sora', sans-serif", fontWeight: 700,
                fontSize: 'clamp(32px, 4vw, 52px)',
                background: 'linear-gradient(125deg, #60a5fa 0%, #a78bfa 60%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>{m.prefix}</div>
            ) : (
              <AnimCounter target={m.target} suffix={m.suffix} prefix={m.prefix} />
            )}
            <div style={{
              fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 400,
              color: 'rgba(148,163,184,0.55)', marginTop: 8, letterSpacing: '0.02em',
            }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 58 }}>
        <div ref={r.ref} style={{
          ...revealStyle(r.visible, 0.5),
          position: 'relative',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: '14px 26px', borderRadius: 999,
          background: 'linear-gradient(135deg, rgba(14,24,56,0.88), rgba(20,20,52,0.7))',
          border: '1px solid rgba(167,139,250,0.34)',
          boxShadow: '0 0 50px rgba(79,70,229,0.18), inset 0 0 24px rgba(96,165,250,0.06)',
          fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: 500,
          color: 'rgba(226,232,240,0.92)', letterSpacing: '0.02em',
          overflow: 'hidden',
          maxWidth: 'min(760px, 100%)',
        }}>
          <span style={{
            position: 'absolute', inset: -1, borderRadius: 999, pointerEvents: 'none',
            background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.22), rgba(167,139,250,0.24), transparent)',
            opacity: 0.7,
            animation: 'cn-shimmer 4.5s linear infinite',
          }} />
          <span style={{
            position: 'relative',
            width: 28, height: 28, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#bfdbfe',
            background: 'radial-gradient(circle, rgba(96,165,250,0.28), rgba(124,58,237,0.1))',
            boxShadow: '0 0 26px rgba(96,165,250,0.44)',
            animation: 'cn-pulse 3.6s ease-in-out infinite',
            flex: '0 0 auto',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </span>
          <span style={{ position: 'relative' }}>
            <strong style={{ color: '#fff', fontWeight: 700 }}>Built on Anthropic Claude AI</strong>
            <span style={{ color: 'rgba(148,163,184,0.62)' }}> - Operational intelligence for finance, inventory and reconciliation.</span>
          </span>
        </div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 2 — Product Walkthrough (Sticky scroll panels)
   ═══════════════════════════════════════════════════════════════════════════ */
const walkSteps = [
  {
    tag: 'INVOICING',
    title: 'Create, track, and reconcile — automatically.',
    desc: 'AI extracts line items, computes GST splits, matches payments to invoices, and flags overdue accounts. Your ledger stays balanced without manual effort.',
    panels: [
      { label: 'Invoice #AHC/0042', value: '₹1,84,250', sub: 'GST 18% • 3 line items', color: '#3b82f6' },
      { label: 'Payment Matched', value: '₹92,125 received', sub: 'NEFT • HDFC Bank', color: '#34d399' },
    ],
  },
  {
    tag: 'INVENTORY',
    title: 'Real-time stock. Intelligent reordering.',
    desc: 'Track raw materials, packaging, and finished goods with WAC valuation. COSMO detects low-stock conditions and auto-generates purchase suggestions.',
    panels: [
      { label: 'Raw Material Stock', value: '342 units', sub: 'WAC: ₹128.50/unit', color: '#f59e0b' },
      { label: 'Reorder Alert', value: 'Kraft Paper ↓', sub: 'Below minimum level', color: '#ef4444' },
    ],
  },
  {
    tag: 'EXPENSES',
    title: 'Every rupee categorized. Every TDS tracked.',
    desc: 'Salaries, freight, royalties, commissions, utilities — each with its own workflow. AI categorizes entries and links them to invoices automatically.',
    panels: [
      { label: 'Royalty — April 2026', value: '₹45,000 net', sub: 'Gross ₹50K • TDS ₹5K', color: '#a78bfa' },
      { label: 'Freight Mismatch ⚠', value: '₹2,400 delta', sub: 'Invoice vs Actual', color: '#f59e0b' },
    ],
  },
  {
    tag: 'REPORTS',
    title: 'P&L, Cash Flow, Trial Balance — one engine.',
    desc: 'The financial engine runs double-entry calculations across all modules. Every metric is auditable, every number traceable to its source transaction.',
    panels: [
      { label: 'Net Profit — Q1 2026', value: '₹12,48,000', sub: 'Accrual basis • DQS: 96', color: '#3b82f6' },
      { label: 'Cash Position', value: '₹8,72,500', sub: 'Collections − Disbursements', color: '#34d399' },
    ],
  },
]

export function ProductWalkthrough() {
  const [activeIdx, setActiveIdx] = useState(0)
  const stepsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = stepsRef.current.indexOf(e.target as HTMLDivElement)
            if (idx >= 0) setActiveIdx(idx)
          }
        })
      },
      { threshold: 0.55 },
    )
    stepsRef.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <Section id="features" style={{ background: '#020510', padding: 0 }}>
      {/* Section header */}
      <div style={{ textAlign: 'center', padding: 'clamp(60px,10vh,120px) 24px 40px' }}>
        <SectionTag text="PRODUCT WALKTHROUGH" />
        <h2 style={{
          fontFamily: "'Sora', sans-serif", fontWeight: 700,
          fontSize: 'clamp(28px, 3.5vw, 48px)', color: '#fff',
          margin: '16px 0 0 0', lineHeight: 1.15,
        }}>
          Four modules.<br />
          <span style={{
            background: 'linear-gradient(125deg, #4facfe, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>One intelligent system.</span>
        </h2>
      </div>

      {/* Sticky scroll area */}
      <div style={{ display: 'flex', gap: 0, maxWidth: 1200, margin: '0 auto' }}>
        {/* Left — sticky floating panels */}
        <div style={{
          flex: '0 0 50%', position: 'sticky', top: '20vh', height: 'fit-content',
          display: 'flex', flexDirection: 'column', gap: 18,
          padding: '0 clamp(24px, 4vw, 60px)',
        }}>
          {walkSteps[activeIdx].panels.map((p, i) => (
            <div key={`${activeIdx}-${i}`} style={{
              background: 'rgba(10,18,42,0.8)',
              border: `1px solid ${p.color}22`,
              borderRadius: 16, padding: '22px 26px',
              boxShadow: `0 0 40px ${p.color}10`,
              animation: 'cn-fade-up 0.5s cubic-bezier(.16,1,.3,1) both',
              animationDelay: `${i * 0.12}s`,
            }}>
              <div style={{
                fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 600,
                color: p.color, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                marginBottom: 8,
              }}>{p.label}</div>
              <div style={{
                fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 700, color: '#fff',
              }}>{p.value}</div>
              <div style={{
                fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: 400,
                color: 'rgba(148,163,184,0.55)', marginTop: 4,
              }}>{p.sub}</div>
            </div>
          ))}
        </div>

        {/* Right — scrolling text steps */}
        <div style={{ flex: '0 0 50%', padding: '0 clamp(24px, 4vw, 60px)' }}>
          {walkSteps.map((step, i) => (
            <div
              key={i}
              ref={el => { stepsRef.current[i] = el }}
              style={{
                minHeight: '70vh',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                opacity: activeIdx === i ? 1 : 0.25,
                transition: 'opacity 0.5s ease',
              }}
            >
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '5px 14px', borderRadius: 100, marginBottom: 18,
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600,
                color: 'rgba(96,165,250,0.9)', letterSpacing: '0.12em', width: 'fit-content',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa' }} />
                {step.tag}
              </div>
              <h3 style={{
                fontFamily: "'Sora', sans-serif", fontWeight: 700,
                fontSize: 'clamp(22px, 2.4vw, 32px)', color: '#fff',
                lineHeight: 1.25, margin: '0 0 16px 0',
              }}>{step.title}</h3>
              <p style={{
                fontFamily: "'Sora', sans-serif", fontSize: 14, fontWeight: 300,
                color: 'rgba(148,163,184,0.6)', lineHeight: 1.75, maxWidth: 420,
              }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 3 — AI Intelligence
   ═══════════════════════════════════════════════════════════════════════════ */
const aiCapabilities = [
  { icon: '⚡', title: 'Instant Invoice Extraction', desc: 'Upload a PDF. AI reads line items, GST rates, and totals — populates the form in seconds.' },
  { icon: '🧠', title: 'Smart Categorization', desc: 'Expenses auto-classify into Salaries, Freight, Royalties, Utilities, or Commission. TDS computed on the fly.' },
  { icon: '📊', title: 'Real-time Analytics', desc: 'The financial engine runs double-entry calculations across all modules. P&L updates as data flows in.' },
  { icon: '🔄', title: 'Automated Reconciliation', desc: 'Payments match to invoices. Stock adjusts on purchase. Credit notes reflect instantly in outstanding balances.' },
]

function AICapabilityCard({ cap, index }: { cap: typeof aiCapabilities[number]; index: number }) {
  const c = useReveal()
  return (
    <div ref={c.ref} style={{
      ...revealStyle(c.visible, index * 0.1),
      background: 'rgba(10,18,42,0.6)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16, padding: '28px 24px',
      transition: 'border-color 0.3s, box-shadow 0.3s, opacity 0.7s, transform 0.7s',
      cursor: 'default',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(96,165,250,0.25)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 40px rgba(59,130,246,0.08)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 14 }}>{cap.icon}</div>
      <h4 style={{
        fontFamily: "'Sora', sans-serif", fontWeight: 600,
        fontSize: 15, color: '#fff', marginBottom: 8,
      }}>{cap.title}</h4>
      <p style={{
        fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 300,
        color: 'rgba(148,163,184,0.55)', lineHeight: 1.65,
      }}>{cap.desc}</p>
    </div>
  )
}

export function AISection() {
  const r = useReveal()
  return (
    <Section style={{
      background: 'linear-gradient(180deg, #060d24 0%, #0a1232 50%, #060d24 100%)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div ref={r.ref} style={{ ...revealStyle(r.visible), textAlign: 'center', marginBottom: 60 }}>
          <SectionTag text="AI INTELLIGENCE" />
          <h2 style={{
            fontFamily: "'Sora', sans-serif", fontWeight: 700,
            fontSize: 'clamp(28px, 3.5vw, 48px)', color: '#fff',
            margin: '16px 0 12px 0', lineHeight: 1.15,
          }}>
            Software that <span style={{
              background: 'linear-gradient(125deg, #a78bfa, #38bdf8)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>thinks operationally.</span>
          </h2>
          <p style={{
            fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 300,
            color: 'rgba(148,163,184,0.55)', maxWidth: 520, margin: '0 auto',
          }}>
            Powered by Anthropic Claude. Every workflow is augmented with intelligence
            that understands your business context.
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20,
        }}>
          {aiCapabilities.map((cap, i) => <AICapabilityCard key={cap.title} cap={cap} index={i} />)}
        </div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 4 — Features Grid
   ═══════════════════════════════════════════════════════════════════════════ */
const features = [
  { icon: '📄', title: 'Invoicing & GST', desc: 'Create GST invoices with auto line-item calculation, e-way bill support, and payment tracking.' },
  { icon: '📦', title: 'Inventory Management', desc: 'Track stock across categories with WAC valuation, reorder alerts, and purchase-linked adjustments.' },
  { icon: '💰', title: 'Expense Tracking', desc: 'Salaries, freight, royalties, commissions, utilities — each with dedicated workflows and TDS handling.' },
  { icon: '📈', title: 'Financial Reports', desc: 'P&L, Cash Flow, Trial Balance — all generated by a single double-entry engine with audit trails.' },
  { icon: '🏭', title: 'Purchase Management', desc: 'Supplier-linked purchase orders, GRN tracking, and automatic inventory stock-in on bill creation.' },
  { icon: '🔒', title: 'Enterprise Security', desc: 'Row-level security on every table. User-scoped data. Session-validated auth. Zero shared state.' },
]

function FeatureCard({ feature, index }: { feature: typeof features[number]; index: number }) {
  const c = useReveal()
  return (
    <div ref={c.ref} style={{
      ...revealStyle(c.visible, index * 0.08),
      background: 'rgba(10,18,42,0.5)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 16, padding: '28px 26px',
      transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.3s, opacity 0.7s',
      cursor: 'default',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(96,165,250,0.2)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 50px rgba(59,130,246,0.06)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.05)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 12 }}>{feature.icon}</div>
      <h4 style={{
        fontFamily: "'Sora', sans-serif", fontWeight: 600,
        fontSize: 15, color: '#fff', marginBottom: 8,
      }}>{feature.title}</h4>
      <p style={{
        fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 300,
        color: 'rgba(148,163,184,0.5)', lineHeight: 1.65,
      }}>{feature.desc}</p>
    </div>
  )
}

export function FeaturesGrid() {
  const r = useReveal()
  return (
    <Section style={{ background: '#020510' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div ref={r.ref} style={{ ...revealStyle(r.visible), textAlign: 'center', marginBottom: 56 }}>
          <SectionTag text="CAPABILITIES" />
          <h2 style={{
            fontFamily: "'Sora', sans-serif", fontWeight: 700,
            fontSize: 'clamp(28px, 3.5vw, 48px)', color: '#fff',
            margin: '16px 0 0 0', lineHeight: 1.15,
          }}>
            Everything your business<br />
            <span style={{
              background: 'linear-gradient(125deg, #38bdf8, #34d399)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>needs to operate.</span>
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18,
        }}>
          {features.map((feature, i) => <FeatureCard key={feature.title} feature={feature} index={i} />)}
        </div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 5 — CTA Footer
   ═══════════════════════════════════════════════════════════════════════════ */
export function CTAFooter({ onEnter }: { onEnter: () => void }) {
  const r = useReveal()
  return (
    <Section style={{
      background: 'radial-gradient(ellipse 80% 60% at 50% 80%, rgba(29,78,216,0.18) 0%, #020510 70%)',
      textAlign: 'center',
      paddingTop: 'clamp(100px, 14vh, 180px)',
      paddingBottom: 'clamp(80px, 10vh, 140px)',
    }}>
      <div ref={r.ref} style={revealStyle(r.visible)}>
        <h2 style={{
          fontFamily: "'Sora', sans-serif", fontWeight: 800,
          fontSize: 'clamp(32px, 4.5vw, 60px)', color: '#fff',
          lineHeight: 1.08, margin: '0 0 20px 0',
        }}>
          Ready to run your<br />
          <span style={{
            background: 'linear-gradient(125deg, #4facfe 0%, #a78bfa 48%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>business in orbit?</span>
        </h2>
        <p style={{
          fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 300,
          color: 'rgba(148,163,184,0.5)', maxWidth: 440, margin: '0 auto 36px auto',
        }}>
          Join the controlled beta. AI-powered ERP built for
          manufacturing businesses that think ahead.
        </p>
        <button onClick={onEnter} type="button" className="cn-cta-primary" style={{
          padding: '16px 38px', fontSize: 15,
        }}>
          Enter COSMO →
        </button>

        {/* Footer credits */}
        <div style={{
          marginTop: 80, paddingTop: 32,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
          fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 400,
          color: 'rgba(148,163,184,0.35)',
        }}>
          <span>© 2026 COSMO ERP</span>
          <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.08)' }} />
          <span>by Harshvardhan Sharma</span>
          <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.08)' }} />
          <span>Intelligence by Anthropic</span>
        </div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared — Section Tag pill
   ═══════════════════════════════════════════════════════════════════════════ */
function SectionTag({ text }: { text: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 14px', borderRadius: 100,
      background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
      fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600,
      color: 'rgba(96,165,250,0.75)', letterSpacing: '0.14em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', opacity: 0.7 }} />
      {text}
    </div>
  )
}
