import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { LOGIN_PATH } from "@/lib/login-path";
import { PLATFORM_LOGIN_PATH } from "@/lib/platform-login-path";

function isShopAdminLoginPage(pathname: string): boolean {
  return pathname === LOGIN_PATH;
}

function isPlatformLoginPage(pathname: string): boolean {
  return pathname === PLATFORM_LOGIN_PATH;
}

// Mantém a sessão do Supabase atualizada e protege /admin e /plataforma.
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  const isPlatformRoute = pathname.startsWith("/plataforma");
  const shopAdminLogin = isShopAdminLoginPage(pathname);
  const platformLogin = isPlatformLoginPage(pathname);

  try {
    const env = getSupabasePublicEnv();

    if (!env) {
      if (isAdminRoute && !shopAdminLogin) {
        return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
      }
      if (isPlatformRoute && !platformLogin) {
        return NextResponse.redirect(new URL(PLATFORM_LOGIN_PATH, request.url));
      }
      return NextResponse.next({ request });
    }

    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Importante: não remover. Renova o token da sessão quando expira.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isAdminRoute && !shopAdminLogin && !user) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    if (isPlatformRoute && !platformLogin && !user) {
      return NextResponse.redirect(new URL(PLATFORM_LOGIN_PATH, request.url));
    }

    // Só manda pro /admin se a sessão for de dono/barbeiro/recepção.
    // Superadmin da plataforma (ou outro login sem profile de loja) precisa
    // ver o formulário — senão vira loop: login → /admin → perfil → login.
    if (shopAdminLogin && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, shop_id")
        .eq("id", user.id)
        .maybeSingle();

      const isShopStaff =
        Boolean(profile?.shop_id) &&
        (profile?.role === "owner" ||
          profile?.role === "barber" ||
          profile?.role === "reception");

      if (isShopStaff) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
    }

    return supabaseResponse;
  } catch {
    if (isAdminRoute && !shopAdminLogin) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }
    if (isPlatformRoute && !platformLogin) {
      return NextResponse.redirect(new URL(PLATFORM_LOGIN_PATH, request.url));
    }
    return NextResponse.next({ request });
  }
}
