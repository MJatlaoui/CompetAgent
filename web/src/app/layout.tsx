import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MetricsHeader } from "@/components/MetricsHeader";

export const metadata: Metadata = {
  title: "CompetAgent",
  description: "Competitive Intelligence Review",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <MetricsHeader />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
