import type { CSSProperties } from "react";

type Tone = "light" | "muted" | "dark";
type Size = "sm" | "md" | "lg";

const FONT_STACK = "'Manrope', 'Inter', 'Segoe UI', sans-serif";

const toneMap: Record<Tone, { ink: string; soft: string; accent: string; frame: string }> = {
  light: {
    ink: "#f8fafc",
    soft: "rgba(226,232,240,0.62)",
    accent: "#8ea4c8",
    frame: "rgba(226,232,240,0.22)",
  },
  muted: {
    ink: "#dbe4f0",
    soft: "rgba(148,163,184,0.78)",
    accent: "#7c93b8",
    frame: "rgba(124,147,184,0.26)",
  },
  dark: {
    ink: "#101827",
    soft: "rgba(15,23,42,0.58)",
    accent: "#4e6484",
    frame: "rgba(15,23,42,0.16)",
  },
};

const sizeMap: Record<Size, { icon: number; name: string; meta: string; gap: number }> = {
  sm: { icon: 30, name: "16px", meta: "10px", gap: 10 },
  md: { icon: 38, name: "22px", meta: "11px", gap: 12 },
  lg: { icon: 52, name: "30px", meta: "12px", gap: 14 },
};

export function CosmoMark({
  size = 40,
  tone = "light",
  boxed = true,
  accent = true,
}: {
  size?: number;
  tone?: Tone;
  boxed?: boolean;
  accent?: boolean;
}) {
  const palette = toneMap[tone];

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {boxed && (
        <rect
          x="3.25"
          y="3.25"
          width="25.5"
          height="25.5"
          rx="8.25"
          stroke={palette.frame}
          strokeWidth="1.5"
        />
      )}
      <path
        d="M12.35 8.75H20.45C22.3554 8.75 23.9 10.2946 23.9 12.2V13.55H20.6V12.95C20.6 12.2044 19.9956 11.6 19.25 11.6H13.55V20.4H19.25C19.9956 20.4 20.6 19.7956 20.6 19.05V18.45H23.9V19.8C23.9 21.7054 22.3554 23.25 20.45 23.25H12.35C10.4446 23.25 8.9 21.7054 8.9 19.8V12.2C8.9 10.2946 10.4446 8.75 12.35 8.75Z"
        fill={palette.ink}
      />
      <path
        d="M16.1 13.95H24.5V17.05H16.1V13.95Z"
        fill={accent ? palette.accent : palette.ink}
        opacity={accent ? 0.92 : 1}
      />
    </svg>
  );
}

export function CosmoWordmark({
  tone = "light",
  size = "md",
  subtitle,
  align = "left",
}: {
  tone?: Tone;
  size?: Size;
  subtitle?: string;
  align?: "left" | "center";
}) {
  const palette = toneMap[tone];
  const scale = sizeMap[size];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        lineHeight: 1,
        alignItems: align === "center" ? "center" : "flex-start",
      }}
    >
      <span
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: scale.name,
          letterSpacing: "-0.065em",
          color: palette.ink,
          textTransform: "uppercase",
        }}
      >
        COSMO
      </span>
      {subtitle && (
        <span
          style={{
            marginTop: "7px",
            fontFamily: FONT_STACK,
            fontWeight: 600,
            fontSize: scale.meta,
            letterSpacing: "0.08em",
            color: palette.soft,
            textTransform: "uppercase",
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

export function CosmoLockup({
  tone = "light",
  size = "md",
  subtitle,
  align = "left",
  boxed = true,
  accent = true,
  style,
}: {
  tone?: Tone;
  size?: Size;
  subtitle?: string;
  align?: "left" | "center";
  boxed?: boolean;
  accent?: boolean;
  style?: CSSProperties;
}) {
  const scale = sizeMap[size];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: scale.gap,
        ...style,
      }}
    >
      <CosmoMark size={scale.icon} tone={tone} boxed={boxed} accent={accent} />
      <CosmoWordmark tone={tone} size={size} subtitle={subtitle} align={align} />
    </div>
  );
}

export const cosmoMarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="3.25" y="3.25" width="25.5" height="25.5" rx="8.25" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>
  <path d="M12.35 8.75H20.45C22.3554 8.75 23.9 10.2946 23.9 12.2V13.55H20.6V12.95C20.6 12.2044 19.9956 11.6 19.25 11.6H13.55V20.4H19.25C19.9956 20.4 20.6 19.7956 20.6 19.05V18.45H23.9V19.8C23.9 21.7054 22.3554 23.25 20.45 23.25H12.35C10.4446 23.25 8.9 21.7054 8.9 19.8V12.2C8.9 10.2946 10.4446 8.75 12.35 8.75Z" fill="#F8FAFC"/>
  <path d="M16.1 13.95H24.5V17.05H16.1V13.95Z" fill="#8EA4C8"/>
</svg>
`;
