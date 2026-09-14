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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applied before paint so the page never flashes the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("live-board-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
