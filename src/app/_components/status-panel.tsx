import type { ReactNode } from "react";
import { checkSessionAction } from "@/app/actions";
import type { SessionStatus } from "@/lib/app/service";
import type { WeeklyContext } from "@/lib/context/build";
import { formatDateTime } from "@/lib/format";
import { ActionButton } from "./action-button";
import { AuchanMark, ClaudeMark, ContextMark } from "./brand-marks";
import { card } from "./ui";

type Tone = "ok" | "ko" | "idle";

const PILL: Record<Tone, string> = {
  ok: "bg-lime-wash text-basil-deep",
  ko: "bg-bordeaux-wash text-bordeaux",
  idle: "bg-oat text-graphite",
};

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${PILL[tone]}`}>
      <span
        className={`size-1.5 rounded-full ${tone === "ok" ? "bg-basil" : tone === "ko" ? "bg-bordeaux" : "bg-pebble"}`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

function Cell({ mark, name, pill, children }: { mark: ReactNode; name: string; pill: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        {mark}
        <div className="min-w-0">
          <h2 className="font-sans text-base leading-tight font-bold tracking-normal">{name}</h2>
          <div className="mt-1">{pill}</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 text-sm">{children}</div>
    </div>
  );
}

/** « Asie, faites voyager vos papilles (jusqu'au 05/10/2026) » → nom et échéance */
function splitTheme(theme: string): { name: string; until: string | null } {
  const m = theme.match(/^(.*?)\s*\((jusqu[^)]*)\)\s*$/);
  return m ? { name: m[1], until: m[2] } : { name: theme, until: null };
}

/** Ce qui fait tourner FreshDrive : la session Auchan, le contexte de la semaine et Claude. */
export function StatusPanel({
  session,
  context,
  backend,
}: {
  session: SessionStatus | null;
  context: WeeklyContext | null;
  backend: string;
}) {
  const sessionTone: Tone = !session ? "idle" : session.ok ? "ok" : "ko";
  return (
    <section
      aria-label="État de FreshDrive"
      className={`${card} grid divide-y divide-oat-line md:grid-cols-[1fr_1.35fr_0.9fr] md:divide-x md:divide-y-0`}
    >
      <Cell
        mark={<AuchanMark />}
        name="Auchan Drive"
        pill={
          <Pill tone={sessionTone}>
            {!session ? "Non vérifiée" : session.ok ? "Connectée" : "À reconnecter"}
          </Pill>
        }
      >
        <p className={session && !session.ok ? "text-bordeaux" : "text-graphite"}>
          {session ? session.message : "La session sera vérifiée à la création d'une semaine."}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
          <ActionButton action={checkSessionAction} label="Vérifier" pendingLabel="Vérification…" />
          {session && <span className="text-xs text-pebble">le {formatDateTime(session.checkedAt)}</span>}
        </div>
      </Cell>

      <Cell
        mark={<ContextMark />}
        name="Contexte de la semaine"
        pill={
          <Pill tone={context ? "ok" : "idle"}>
            {context ? `À jour, ${formatDateTime(context.generatedAt)}` : "Pas encore chargé"}
          </Pill>
        }
      >
        {context ? (
          <>
            <p className="flex gap-6">
              <span>
                <span className="block font-display text-2xl leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                  {context.promos.length}
                </span>
                <span className="text-graphite">promos</span>
              </span>
              <span>
                <span className="block font-display text-2xl leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                  {context.antiGaspi.length}
                </span>
                <span className="text-graphite">anti-gaspi</span>
              </span>
            </p>
            {(context.themes.length > 0 || context.events.length > 0) && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Thèmes et événements">
                {context.themes.map(splitTheme).map((t) => (
                  <li
                    key={t.name}
                    title={t.until ?? undefined}
                    className="rounded-full border border-oat-line bg-cream px-2.5 py-0.5 text-xs text-charcoal"
                  >
                    {t.name}
                  </li>
                ))}
                {context.events.map((e) => (
                  <li key={e.name} className="rounded-full bg-honey-wash px-2.5 py-0.5 text-xs text-honey-ink">
                    {e.name}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-graphite">
            Promos, anti-gaspi et thèmes Auchan seront chargés à la création d&apos;une semaine.
          </p>
        )}
      </Cell>

      <Cell mark={<ClaudeMark />} name="Claude" pill={<Pill tone="ok">Configuré</Pill>}>
        <p className="font-medium">{backend}</p>
        <p className="text-graphite">Écrit les recettes et vérifie le choix des produits.</p>
      </Cell>
    </section>
  );
}
