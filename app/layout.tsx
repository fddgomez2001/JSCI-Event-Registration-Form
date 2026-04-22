import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Joyful Sound Church - Event Registration",
  description:
    "Leyte Christian Leadership Conference 2026 registration landing page",
  icons: {
    icon: "https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/LOGO.png",
    shortcut:
      "https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/LOGO.png",
    apple:
      "https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/LOGO.png",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
