import { expect, test } from "./fixtures";

/**
 * Infra smoke: the liveness health endpoint container hosts probe.
 */
test("health endpoint returns 200 ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
