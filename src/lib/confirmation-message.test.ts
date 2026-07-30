import { describe, expect, it } from "vitest";
import {
  applyConfirmationTags,
  buildWhatsappChatUrl,
  DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE,
} from "@/lib/confirmation-message";

const ctx = {
  customerFirstName: "Éder",
  customerLastName: "Castanho",
  professionalNickname: "Chico",
  date: "2026-07-28",
  startTime: "15:00:00",
  serviceNames: ["Corte", "Barba", "Corte"],
  shopName: "Barbearia Exemplo",
};

describe("applyConfirmationTags", () => {
  it("substitui todas as tags do modelo padrão", () => {
    const text = applyConfirmationTags(
      DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE,
      ctx
    );
    expect(text).toContain("Olá Éder!");
    expect(text).toContain("Barbearia Exemplo");
    expect(text).toContain("28/07/2026");
    expect(text).toContain("15:00");
    expect(text).toContain("Corte ×2, Barba");
    expect(text).toContain("Chico");
    expect(text).not.toContain("{{");
  });

  it("usa nome completo na tag {{nome}}", () => {
    expect(applyConfirmationTags("Oi {{nome}}", ctx)).toBe("Oi Éder Castanho");
  });

  it("deixa tag desconhecida intacta", () => {
    expect(applyConfirmationTags("Oi {{foo}}", ctx)).toBe("Oi {{foo}}");
  });
});

describe("buildWhatsappChatUrl", () => {
  it("não duplica o 55 quando o número já tem DDI", () => {
    expect(buildWhatsappChatUrl("5513981008852")).toBe(
      "https://wa.me/5513981008852"
    );
  });

  it("adiciona 55 quando falta o DDI", () => {
    expect(buildWhatsappChatUrl("13981008852")).toBe(
      "https://wa.me/5513981008852"
    );
  });

  it("inclui a mensagem pronta no link", () => {
    const url = buildWhatsappChatUrl("5513981008852", "Olá Éder!");
    expect(url).toBe(
      `https://wa.me/5513981008852?text=${encodeURIComponent("Olá Éder!")}`
    );
  });

  it("retorna null para número inválido", () => {
    expect(buildWhatsappChatUrl("abc")).toBeNull();
  });
});
