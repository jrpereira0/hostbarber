import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/",
    "/login-admin",
    "/admin/:path*",
    "/plataforma",
    "/plataforma/:path*",
  ],
};
