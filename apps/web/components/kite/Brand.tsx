import Link from "next/link";

export function KiteGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="34"
      viewBox="0 0 30 34"
      fill="none"
      aria-hidden="true"
    >
      <path d="M15 1L29 13L15 28L1 13L15 1Z" fill="currentColor" />
      <path d="M15 1V28M1 13H29" stroke="var(--bg)" strokeWidth="1.5" />
      <path d="M15 28L20 33" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
export function Brand() {
  return (
    <Link href="/" className="kite-brand" aria-label="Kite home">
      <KiteGlyph />
      <span>
        kite<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
export function OrbitArt({ variant = 0 }: { variant?: number }) {
  return (
    <svg
      className={`orbit-art orbit-${variant}`}
      viewBox="0 0 360 250"
      fill="none"
      aria-hidden="true"
    >
      <g transform="translate(180 125)">
        <ellipse rx="118" ry="47" transform="rotate(-32)" />
        <ellipse rx="118" ry="47" transform="rotate(32)" />
        <ellipse rx="118" ry="47" transform="rotate(90)" />
        <circle r="68" />
        <path className="orbit-core" d="M0 -58L51 -9L0 57L-51 -9Z" />
        <path d="M0 -58V57M-51 -9H51" />
        <circle className="orbit-dot" cx="100" cy="-61" r="7" />
        <circle className="orbit-dot" cx="-73" cy="-87" r="4" />
        <circle className="orbit-dot" cx="8" cy="116" r="5" />
      </g>
    </svg>
  );
}
