import { type NextRequest, NextResponse } from "next/server";
import { isAllowedHost } from "@/lib/app/host-guard";

/** Refuse toute requête dont l'en-tête Host n'est pas l'adresse locale de l'app (DNS rebinding). */
export function proxy(request: NextRequest) {
  if (isAllowedHost(request.headers.get("host"))) return NextResponse.next();
  return new Response("Accès refusé : MyFresh ne répond qu'à http://127.0.0.1:3141.", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
