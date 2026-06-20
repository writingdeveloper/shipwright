/**
 * `/api/health` — liveness probe for container hosts (Docker/Coolify/Fly/VPS).
 * Returns 200 with a small JSON body. Intentionally has NO DB dependency: a
 * flaky database shouldn't fail liveness and trigger a container restart
 * (readiness with a DB ping is a separate, deliberate concern, out of scope).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" });
}
