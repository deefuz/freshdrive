/** Logo MyFresh : un citron vert et le nom sur deux lignes, en capitales grasses. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 48 40" aria-hidden="true" className="h-8 w-auto">
        <path d="M24 9c-4-6-10-8-16-6 2 6 8 9 16 6Z" fill="#067a46" />
        <ellipse cx="26" cy="23" rx="20" ry="15" transform="rotate(-16 26 23)" fill="#91c11e" />
        <path
          d="M12 30c6 4 18 4 26-4"
          fill="none"
          stroke="#fffefa"
          strokeOpacity=".55"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-[0.9375rem] leading-[0.9] font-extrabold tracking-[-0.02em] uppercase">
        My
        <br />
        Fresh
      </span>
    </span>
  );
}
