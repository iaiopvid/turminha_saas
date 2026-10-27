import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turminha | Mais proximidade, mais memórias",
  description: "Uma experiência segura e acolhedora para escolas, professoras e famílias.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
