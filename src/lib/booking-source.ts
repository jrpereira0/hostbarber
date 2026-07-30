import { Globe, Monitor } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Origem do agendamento — ícone discreto no card da agenda. */
export const BOOKING_SOURCES = ["admin", "site"] as const;

export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  admin: "Painel",
  site: "Site do cliente",
};

export const BOOKING_SOURCE_ICONS: Record<BookingSource, LucideIcon> = {
  admin: Monitor,
  site: Globe,
};

export function parseBookingSource(
  value: string | null | undefined
): BookingSource | null {
  if (value === "admin" || value === "site") return value;
  return null;
}
