"use client"

import { AdminLoginForm } from "@/components/admin/admin-login-form"
import "@/components/admin/admin-login-theme.css"
import { BrandMark } from "@/components/brand-logo"
import { PRODUCT_NAME } from "@/lib/brand"

type AdminLoginScreenProps = {
  configured: boolean
  errorMessage?: string
}

export function AdminLoginScreen({
  configured,
  errorMessage,
}: AdminLoginScreenProps) {
  return (
    <div className="login-theme relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="login-glow pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="login-grid pointer-events-none absolute inset-x-0 top-0 h-[55vh]"
      />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <BrandMark className="login-enter-title mb-5 size-20 sm:mb-6 sm:size-24" />
          <h1 className="login-display login-enter-title text-[1.75rem] leading-tight font-medium tracking-tight text-white sm:text-[2.15rem]">
            {PRODUCT_NAME}
          </h1>
          <p className="login-enter-subtitle mt-2.5 max-w-[20rem] text-sm leading-relaxed text-[var(--login-muted)]">
            Entre no painel para gerenciar horários, clientes e a rotina do
            salão.
          </p>
        </div>

        <div className="login-enter-card login-card relative w-full max-w-[420px] overflow-hidden rounded-2xl">
          <div className="relative p-5 sm:p-8">
            <AdminLoginForm
              configured={configured}
              errorMessage={errorMessage}
            />
          </div>
        </div>
      </main>

      <footer className="login-enter-footer relative z-10 flex items-center justify-center px-4 pb-6 pt-2">
        <p className="text-center text-xs tracking-wide text-[var(--login-muted)]">
          © 2026 {PRODUCT_NAME}
          <sup className="ml-0.5 text-[0.65em] leading-none">®</sup>
        </p>
      </footer>
    </div>
  )
}
