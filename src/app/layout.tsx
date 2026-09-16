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
              'try{var k="live-board-theme",t=localStorage.getItem(k);if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;' +
              // A framed preview is its own document. The storage event is how
              // one same-origin document hears another change the theme.
              'addEventListener("storage",function(e){if(e.key===k&&(e.newValue==="light"||e.newValue==="dark"))document.documentElement.dataset.theme=e.newValue})}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
