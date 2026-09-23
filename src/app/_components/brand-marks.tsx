/** Pastilles-logos des services qu'utilise FreshDrive. */

const tile = "inline-flex size-10 shrink-0 items-center justify-center rounded-lg";

/** Auchan Drive : le logo officiel, chargé depuis auchan.fr (aucune copie dans le dépôt) */
export function AuchanMark() {
  return (
    <span className={`${tile} border border-oat-line bg-paper`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- image distante d'auchan.fr, affichée telle quelle */}
      <img src="https://www.auchan.fr/favicon.ico" alt="" width={26} height={26} referrerPolicy="no-referrer" />
    </span>
  );
}

/** Contexte de la semaine : étiquette promo sur rouge vichy */
export function ContextMark() {
  return (
    <span className={`${tile} bg-vichy`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="#fffefa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12.6V4.5A1.5 1.5 0 0 1 4.5 3h8.1a1.5 1.5 0 0 1 1 .44l6.96 6.96a1.5 1.5 0 0 1 0 2.12l-7.04 7.04a1.5 1.5 0 0 1-2.12 0L3.44 13.6a1.5 1.5 0 0 1-.44-1Z" />
        <circle cx="8" cy="8" r="1.6" fill="#fffefa" />
      </svg>
    </span>
  );
}

/** Claude : éclat rayonnant sur terre cuite */
export function ClaudeMark() {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <span className={`${tile} bg-claude`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-6">
        {rays.map((deg, i) => (
          <line
            key={deg}
            x1="12"
            y1="12"
            x2="12"
            y2={i % 2 ? 4.5 : 2.5}
            stroke="#fffefa"
            strokeWidth="2.2"
            strokeLinecap="round"
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
      </svg>
    </span>
  );
}
