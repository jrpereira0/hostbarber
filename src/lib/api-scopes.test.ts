import { describe, expect, it } from "vitest";
import { hasScope } from "@/lib/api-scopes";

describe("api-scopes", () => {
  it("valida scope necessário", () => {
    expect(hasScope(["catalog:read"], "catalog:read")).toBe(true);
    expect(hasScope(["catalog:read"], "appointments:create")).toBe(false);
  });
});
