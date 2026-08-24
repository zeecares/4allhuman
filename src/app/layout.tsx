import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Don't Train On Me",
  description: "Protect any creator's content from AI training in 60 seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
