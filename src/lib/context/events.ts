export interface CalendarEvent {
  name: string;
  date: string; // YYYY-MM-DD
}

const DAY = 86_400_000;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Algorithme de Meeus/Jones/Butcher */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

function lastSundayOf(year: number, month: number): Date {
  const last = utc(year, month + 1, 0);
  return addDays(last, -last.getUTCDay());
}

function nthSundayOf(year: number, month: number, n: number): Date {
  const first = utc(year, month, 1);
  return addDays(first, ((7 - first.getUTCDay()) % 7) + 7 * (n - 1));
}

function eventsOfYear(y: number): CalendarEvent[] {
  const easter = easterSunday(y);
  const pentecost = addDays(easter, 49);
  let mothers = lastSundayOf(y, 5);
  if (iso(mothers) === iso(pentecost)) mothers = nthSundayOf(y, 6, 1);
  const events: [string, Date][] = [
    ["Nouvel an", utc(y, 1, 1)],
    ["Épiphanie", utc(y, 1, 6)],
    ["Chandeleur", utc(y, 2, 2)],
    ["Saint-Valentin", utc(y, 2, 14)],
    ["Mardi gras", addDays(easter, -47)],
    ["Pâques", easter],
    ["Fête des mères", mothers],
    ["Fête des pères", nthSundayOf(y, 6, 3)],
    ["Rentrée scolaire", utc(y, 9, 1)],
    ["Halloween", utc(y, 10, 31)],
    ["Noël", utc(y, 12, 25)],
    ["Réveillon du Nouvel an", utc(y, 12, 31)],
  ];
  return events.map(([name, date]) => ({ name, date: iso(date) }));
}

/** Événements dans [from, from + horizonDays]. La rentrée reste active jusqu'au 15 septembre. */
export function upcomingEvents(from: Date, horizonDays = 14): CalendarEvent[] {
  const start = utc(from.getFullYear(), from.getMonth() + 1, from.getDate());
  const end = addDays(start, horizonDays);
  const y = start.getUTCFullYear();
  return [...eventsOfYear(y), ...eventsOfYear(y + 1)].filter((e) => {
    const d = new Date(`${e.date}T00:00:00Z`);
    const until = e.name === "Rentrée scolaire" ? addDays(d, 14) : d;
    return until >= start && d <= end;
  });
}
