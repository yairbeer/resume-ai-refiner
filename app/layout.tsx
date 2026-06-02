import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume AI Refiner",
  description: "Refine a stale CV from a file or pasted text without saving it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
