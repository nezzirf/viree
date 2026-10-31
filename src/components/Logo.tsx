/** Logo Virée : une boucle fermée (le circuit) partant d'un point (chez toi). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#D4FF3A" />
      <path
        d="M20 46 C 8 34, 14 14, 32 14 C 50 14, 56 32, 44 42 C 36 49, 28 44, 30 36"
        fill="none"
        stroke="#0B0F14"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="20" cy="46" r="5.5" fill="#FF6B4A" stroke="#0B0F14" strokeWidth="3" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={30} />
      <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight">Virée</span>
    </span>
  );
}
