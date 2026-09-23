/** Logo FreshDrive : une nappe vichy rouge, une assiette et une feuille de basilic, puis le nom sur deux lignes. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  const bands = [0, 16, 32];
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <clipPath id="freshdrive-mark">
        <rect width="48" height="48" rx="10" />
      </clipPath>
      <g clipPath="url(#freshdrive-mark)">
        <rect width="48" height="48" fill="#fffefa" />
        {bands.map((x) => (
          <rect key={`v${x}`} x={x} width="8" height="48" fill="#c8372d" fillOpacity=".55" />
        ))}
        {bands.map((y) => (
          <rect key={`h${y}`} y={y} width="48" height="8" fill="#c8372d" fillOpacity=".55" />
        ))}
      </g>
      <circle cx="25.5" cy="25.5" r="13.5" fill="#232323" fillOpacity=".15" />
      <circle cx="24" cy="24" r="13.5" fill="#fffefa" />
      <circle cx="24" cy="24" r="9.5" fill="none" stroke="#efe9de" strokeWidth="1.5" />
      <path d="M17.5 28.5c1-7 6-11 13-11-1 7-6 11-13 11Z" fill="#067a46" />
      <path d="M18.5 27.5c3-2.5 6-5 10-8.5" fill="none" stroke="#fffefa" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[0.9375rem] leading-[0.9] font-extrabold tracking-[-0.02em] uppercase">
        Fresh
        <br />
        Drive
      </span>
    </span>
  );
}
