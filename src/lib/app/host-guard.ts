/** Port de l'app (`next dev` / `next start`, voir package.json). */
export const APP_PORT = 3141;

const ALLOWED_HOSTS = new Set([`127.0.0.1:${APP_PORT}`, `localhost:${APP_PORT}`]);

/**
 * Protection contre le « DNS rebinding » : une page web piégée peut faire pointer son propre nom de domaine
 * vers 127.0.0.1, mais son navigateur envoie alors ce nom dans l'en-tête Host. On n'accepte que les adresses locales.
 */
export function isAllowedHost(host: string | null): boolean {
  return host !== null && ALLOWED_HOSTS.has(host);
}
