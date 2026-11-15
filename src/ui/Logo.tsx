/**
 * The Tana Team mark (three people under a check circle), drawn as SVG so it
 * follows the chosen appearance theme. The home-screen icon, favicon and link
 * preview stay the fixed PNG in public/icons — the OS caches those.
 */
export default function Logo({ size = 72, className = 'login-logo' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Tana Team" data-testid="app-logo">
      <rect width="512" height="512" rx="112" fill="var(--card)" />
      <g transform="translate(40 40) scale(0.84375)">
        {/* back people */}
        <g fill="var(--fg)" opacity="0.55">
          <circle cx="112" cy="296" r="56" />
          <path d="M16 464v-24c0-40 32-72 72-72h48c40 0 72 32 72 72v24z" />
          <circle cx="400" cy="296" r="56" />
          <path d="M304 464v-24c0-40 32-72 72-72h48c40 0 72 32 72 72v24z" />
        </g>
        {/* front person, outlined in the card colour so it stands apart from the back pair */}
        <g fill="var(--fg)" stroke="var(--card)" strokeWidth="14" paintOrder="stroke">
          <circle cx="256" cy="304" r="64" />
          <path d="M144 496v-32c0-44 36-80 80-80h64c44 0 80 36 80 80v32z" />
        </g>
        {/* check circle */}
        <circle cx="256" cy="120" r="104" fill="var(--accent)" />
        <path d="M216 124l28 28 56-60" fill="none" stroke="var(--accent-fg)" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
