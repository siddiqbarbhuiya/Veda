// Hex values live here only because ImageResponse cannot read CSS variables.
// They mirror --accent and --accent-fg in globals.css (dark theme).
export const BRAND = {
  bg: "#0b0d12",
  accent: "#5b5fef",
  accentFg: "#ffffff",
  fg: "#e6e9f0",
  muted: "#a3acbd",
};

// Same shape as LogoMark in components/ui/logo.tsx.
export function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill={BRAND.accent} />
      <path d="M8.5 9.5 16 22.5l7.5-13" stroke={BRAND.accentFg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="23" width="6" height="2.4" rx="1.2" fill={BRAND.accentFg} fillOpacity="0.75" />
    </svg>
  );
}
