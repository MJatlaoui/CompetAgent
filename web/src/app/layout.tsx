import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getPendingCount } from "@/lib/db";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CompetAgent",
  description: "Competitive Intelligence Review",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pendingCount = getPendingCount();

  return (
    <html lang="en">
      <body className={geist.className}>
        <div className="flex h-screen">
          <Sidebar pendingCount={pendingCount} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
