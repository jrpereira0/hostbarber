import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PRODUCT_NAME } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

/** Evita zoom automático no iPhone (foco em campos / abertura da página). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Tipografia da nova identidade — usada na login (fase 1); demais telas ainda usam Geist. */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const description =
    "HOSTBARBER — agenda online para barbearias: horários, clientes e painel em um só lugar.";

  return {
    metadataBase: siteUrl,
    title: {
      default: PRODUCT_NAME,
      template: `%s | ${PRODUCT_NAME}`,
    },
    description,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: PRODUCT_NAME,
      title: PRODUCT_NAME,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: PRODUCT_NAME,
      description,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
