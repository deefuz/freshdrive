import type { ReactNode } from "react";
import { checkSessionAction } from "@/app/actions";
import type { SessionStatus } from "@/lib/app/service";
import type { WeeklyContext } from "@/lib/context/build";
import { DRIVE_IDS, type DriveId, DRIVES } from "@/lib/drives/drive";
import { formatDateTime } from "@/lib/format";
import { ActionButton } from "./action-button";
import { ClaudeMark, ContextMark, DriveMark } from "./brand-marks";
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

/** Connexion à un Drive, sur une ligne : logo, état, dernier message et bouton de vérification. */
function DriveStatus({ drive, session }: { drive: DriveId; session: SessionStatus | null }) {
  const tone: Tone = !session ? "idle" : session.ok ? "ok" : "ko";
  const { name, siteHost } = DRIVES[drive];
  return (
    <li className="flex items-center gap-3 rounded-lg bg-paper p-3">
      <DriveMark drive={drive} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{name}</span>
          <Pill tone={tone}>{!session ? "Non vérifiée" : session.ok ? "Connectée" : "À reconnecter"}</Pill>
        </p>
        <p className={`mt-1 text-sm ${session && !session.ok ? "text-bordeaux" : "text-graphite"}`}>
          {session ? session.message : `Connecte-toi sur ${siteHost} dans Chrome, puis vérifie.`}
          {session && <span className="text-pebble"> Vérifiée le {formatDateTime(session.checkedAt)}.</span>}
        </p>
      </div>
      <ActionButton action={checkSessionAction.bind(null, drive)} label="Vérifier" pendingLabel="Vérification…" />
    </li>
  );
}

/** Connexions aux Drives : une ligne par enseigne, avec son bouton « Vérifier ». */
export function DrivesBand({ sessions }: { sessions: Record<DriveId, SessionStatus | null> }) {
  return (
    <div className="rounded bg-oat p-3">
      <h2 className="px-1 pb-2.5 font-sans text-sm leading-tight font-bold tracking-normal text-graphite">Mes Drives</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {DRIVE_IDS.map((drive) => (
          <DriveStatus key={drive} drive={drive} session={sessions[drive]} />
        ))}
      </ul>
    </div>
  );
}

/** Ce qui fait tourner FreshDrive : les connexions aux Drives, puis le contexte de la semaine et Claude. */
export function StatusPanel({
  sessions,
  context,
  contextDrive,
  backend,
}: {
  sessions: Record<DriveId, SessionStatus | null>;
  context: WeeklyContext | null;
  /** Drive dont le contexte est affiché (celui de la dernière semaine) */
  contextDrive: DriveId;
  backend: string;
}) {
  return (
    <section aria-label="État de FreshDrive" className="space-y-3">
      <DrivesBand sessions={sessions} />

      <div className={`${card} grid divide-y divide-oat-line md:grid-cols-[1.6fr_1fr] md:divide-x md:divide-y-0`}>
        <Cell
          mark={<ContextMark />}
          name={`Contexte de la semaine · ${DRIVES[contextDrive].label}`}
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
              Promos, anti-gaspi et thèmes {DRIVES[contextDrive].label} seront chargés à la vérification du Drive.
            </p>
          )}
        </Cell>

        <Cell mark={<ClaudeMark />} name="Claude" pill={<Pill tone="ok">Configuré</Pill>}>
          <p className="font-medium">{backend}</p>
          <p className="text-graphite">Écrit les recettes et vérifie le choix des produits.</p>
        </Cell>
      </div>
    </section>
  );
}
