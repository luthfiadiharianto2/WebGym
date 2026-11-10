import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Footer, Header } from "@/components/ui/Header";

export const metadata: Metadata = {
  title: { default: "IronVision 3D", template: "%s · IronVision 3D" },
  description: "Gym virtual 3D dengan AI Camera Scan on-device, statistik pribadi, dan rekomendasi latihan personal.",
};

export const viewport: Viewport = {
  themeColor: "#050608",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
