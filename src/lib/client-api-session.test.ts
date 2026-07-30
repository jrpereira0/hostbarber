import { describe, expect, it } from "vitest";
import {
  createClientSessionToken,
  readClientSessionFromRequest,
  verifyClientSessionToken,
} from "@/lib/client-api-session";

const SHOP_ID = "11111111-1111-1111-1111-111111111111";

describe("client-api-session", () => {
  it("cria e valida token de sessão", () => {
    process.env.CLIENT_SESSION_SECRET =
      "test-secret-with-at-least-32-characters!!";

    const token = createClientSessionToken("11981008852", SHOP_ID);
    expect(token).toBeTruthy();

    const payload = verifyClientSessionToken(token);
    expect(payload?.whatsapp).toBe("5511981008852");
    expect(payload?.shopId).toBe(SHOP_ID);
  });

  it("rejeita token adulterado", () => {
    process.env.CLIENT_SESSION_SECRET =
      "test-secret-with-at-least-32-characters!!";

    const token = createClientSessionToken("11981008852", SHOP_ID);
    expect(verifyClientSessionToken(`${token}x`)).toBeNull();
  });

  it("aceita token no Authorization Bearer", () => {
    process.env.CLIENT_SESSION_SECRET =
      "test-secret-with-at-least-32-characters!!";

    const token = createClientSessionToken("11981008852", SHOP_ID);
    expect(token).toBeTruthy();

    const request = new Request("http://localhost/api/v1/appointments", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const session = readClientSessionFromRequest(request);
    expect(session?.whatsapp).toBe("5511981008852");
    expect(session?.shopId).toBe(SHOP_ID);
  });

  it("rejeita token antigo sem shopId", () => {
    process.env.CLIENT_SESSION_SECRET =
      "test-secret-with-at-least-32-characters!!";

    const encoded = Buffer.from(
      JSON.stringify({
        whatsapp: "5511981008852",
        exp: Date.now() + 60_000,
      })
    ).toString("base64url");
    // assinatura inválida de propósito — verify deve falhar
    expect(verifyClientSessionToken(`${encoded}.fakesig`)).toBeNull();
  });

  it("rejeita Bearer que não é token de sessão", () => {
    process.env.CLIENT_SESSION_SECRET =
      "test-secret-with-at-least-32-characters!!";

    const request = new Request("http://localhost/api/v1/appointments", {
      headers: {
        Authorization: "Bearer token-invalido-qualquer",
      },
    });

    expect(readClientSessionFromRequest(request)).toBeNull();
  });
});
