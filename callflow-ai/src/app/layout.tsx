import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CallFlow AI", template: "%s · CallFlow AI" },
  description: "AI revenue recovery and front office for HVAC companies.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
