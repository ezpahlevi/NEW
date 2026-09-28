import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEW | SaaS Renewal Reviews",
  description: "Review SaaS subscriptions before another renewal payment."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
