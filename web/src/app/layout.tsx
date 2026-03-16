import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MetricsHeader } from "@/components/MetricsHeader";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "CompetAgent",
  description: "Competitive Intelligence Review",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme immediately to prevent flash of unstyled content */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('ca-theme');if(t==='tactical')document.documentElement.classList.add('tactical');})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6">
              <MetricsHeader />
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
