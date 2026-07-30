import { redirect } from "next/navigation";
import { bookingPathForSlug } from "@/lib/booking-path";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultPublicShopRef } from "@/lib/shops/queries";
import { BookingUnavailable } from "@/components/booking/booking-unavailable";

export const dynamic = "force-dynamic";

/** `/agenda` redireciona para `/agenda/{slug}` da loja padrão (primeira ativa). */
export default async function AgendaIndexRedirect() {
  const admin = createAdminClient();
  if (!admin) return <BookingUnavailable />;

  const shop = await getDefaultPublicShopRef(admin);
  if (!shop) return <BookingUnavailable />;

  redirect(bookingPathForSlug(shop.slug));
}
