import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Board",
  description: "Company-scoped live FedEx tracking boards.",
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
