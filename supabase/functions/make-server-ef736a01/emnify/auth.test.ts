import { describe, expect, it } from "vitest";
import { createEmnifyAuth, isEmnifyAuthError } from "./auth.ts";

type Stored = Record<string, any>;

function setup(responses: Array<{ status: number; body?: any; retryAfter?: string }>) {
  let clock = 1_000_000;
  const stored: Stored = {};
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const r = responses.shift() ?? { status: 200, body: { auth_token: "jwt-extra" } };
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : "rate limited", {
      status: r.status,
      headers: r.retryAfter ? { "Retry-After": r.retryAfter } : {},
    });
  };
  const store = {
    get: async (k: string) => stored[k] ?? null,
    set: async (k: string, v: any) => { stored[k] = v; },
  };
  const make = () =>
    createEmnifyAuth({
      baseUrl: "https://emnify.test/api/v1",
      getAppToken: () => " app-token ",
      fetchFn: fetchFn as any,
      store,
      now: () => clock,
    });
  return { make, calls, stored, advance: (ms: number) => { clock += ms; } };
}

describe("createEmnifyAuth", () => {
  it("authenticates once and reuses the token", async () => {
    const t = setup([{ status: 200, body: { auth_token: "jwt-1" } }]);
    const auth = t.make();
    expect(await auth.getToken()).toBe("jwt-1");
    expect(await auth.getToken()).toBe("jwt-1");
    expect(t.calls).toEqual(["https://emnify.test/api/v1/authenticate"]);
  });

  it("shares one /authenticate call between concurrent callers", async () => {
    const t = setup([{ status: 200, body: { auth_token: "jwt-1" } }]);
    const auth = t.make();
    const tokens = await Promise.all(Array.from({ length: 8 }, () => auth.getToken()));
    expect(new Set(tokens)).toEqual(new Set(["jwt-1"]));
    expect(t.calls.length).toBe(1);
  });

  it("reuses a token stored by another instance instead of authenticating", async () => {
    const t = setup([{ status: 200, body: { auth_token: "jwt-1" } }]);
    await t.make().getToken();
    const other = t.make(); // simulates a cold isolate sharing the same KV
    expect(await other.getToken()).toBe("jwt-1");
    expect(t.calls.length).toBe(1);
  });

  it("re-authenticates when the token is close to expiring", async () => {
    const t = setup([
      { status: 200, body: { auth_token: "jwt-1" } },
      { status: 200, body: { auth_token: "jwt-2" } },
    ]);
    const auth = t.make();
    expect(await auth.getToken()).toBe("jwt-1");
    t.advance(46 * 60 * 1000); // inside the 5-minute safety margin of the 50-minute TTL
    expect(await auth.getToken()).toBe("jwt-2");
    expect(t.calls.length).toBe(2);
  });

  it("on 429 enters a shared cooldown and stops calling /authenticate", async () => {
    const t = setup([{ status: 429 }]);
    const auth = t.make();
    const err = await auth.getToken().catch((e) => e);
    expect(isEmnifyAuthError(err)).toBe(true);
    expect(err.status).toBe(429);
    expect(err.message).toMatch(/429/);

    // Same instance and a cold instance both fail fast without hitting emnify.
    await expect(auth.getToken()).rejects.toThrow(/429/);
    await expect(t.make().getToken()).rejects.toThrow(/429/);
    expect(t.calls.length).toBe(1);
  });

  it("honours Retry-After and recovers once the cooldown is over", async () => {
    const t = setup([
      { status: 429, retryAfter: "120" },
      { status: 200, body: { auth_token: "jwt-ok" } },
    ]);
    const auth = t.make();
    await auth.getToken().catch(() => {});
    t.advance(90 * 1000);
    await expect(auth.getToken()).rejects.toThrow(/429/);
    t.advance(31 * 1000);
    expect(await auth.getToken()).toBe("jwt-ok");
    expect(t.calls.length).toBe(2);
  });

  it("reports a rejected token as invalid, not as rate limited", async () => {
    const t = setup([{ status: 401, body: { message: "bad token" } }]);
    const err = await t.make().getToken().catch((e) => e);
    expect(isEmnifyAuthError(err)).toBe(true);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/inválido \(401\)/);
  });

  it("sends the trimmed application token", async () => {
    let sent: any = null;
    const auth = createEmnifyAuth({
      baseUrl: "https://emnify.test/api/v1",
      getAppToken: () => " app-token ",
      fetchFn: (async (_u: string, init: any) => {
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({ auth_token: "jwt" }), { status: 200 });
      }) as any,
      store: { get: async () => null, set: async () => {} },
      now: () => 0,
    });
    await auth.getToken();
    expect(sent).toEqual({ application_token: "app-token" });
  });

  it("keeps working when the shared store fails", async () => {
    const auth = createEmnifyAuth({
      baseUrl: "https://emnify.test/api/v1",
      getAppToken: () => "t",
      fetchFn: (async () => new Response(JSON.stringify({ auth_token: "jwt" }), { status: 200 })) as any,
      store: {
        get: async () => { throw new Error("kv down"); },
        set: async () => { throw new Error("kv down"); },
      },
      now: () => 0,
    });
    expect(await auth.getToken()).toBe("jwt");
  });

  it("fails clearly when the application token is not configured", async () => {
    const auth = createEmnifyAuth({
      baseUrl: "https://emnify.test/api/v1",
      getAppToken: () => undefined,
      fetchFn: (async () => { throw new Error("should not be called"); }) as any,
      store: { get: async () => null, set: async () => {} },
      now: () => 0,
    });
    await expect(auth.getToken()).rejects.toThrow(/EMNIFY_API_TOKEN/);
  });
});
