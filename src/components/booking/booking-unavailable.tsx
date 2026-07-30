import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BOOKING_PATH } from "@/lib/booking-path";
import "@/styles/booking-theme.css";

type BookingUnavailableProps = {
  title?: string;
  description?: string;
  showRetry?: boolean;
};

export function BookingUnavailable({
  title = "Agenda indisponível",
  description = "Não foi possível carregar os horários agora. Tente de novo em instantes ou fale com a barbearia pelo WhatsApp.",
  showRetry = true,
}: BookingUnavailableProps) {
  return (
    <div className="booking-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="booking-display text-xl font-medium">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {showRetry ? (
        <Button asChild>
          <Link href={BOOKING_PATH}>Tentar de novo</Link>
        </Button>
      ) : null}
    </div>
  );
}
