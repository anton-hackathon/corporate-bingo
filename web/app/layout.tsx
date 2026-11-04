import type { Metadata, Viewport } from "next";
import { Inter, Rubik } from "next/font/google";
import { canOpenHR, getSessionUser, hrModeOn } from "@/lib/auth";
import { env } from "@/lib/env";
import { TabBar, TopBar } from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const rubik = Rubik({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-rubik",
  display: "swap",
});

const DESCRIPTION =
  "A board of small, slightly silly tasks. Teams of three, drawn at random across departments. A shared feed and a leaderboard.";

export const metadata: Metadata = {
  // Teams, Telegram and Slack fetch the preview from outside, so the image has
  // to be an absolute URL. Next builds one from here; without it the tag comes
  // out relative and the link unfurls as bare text.
  metadataBase: new URL(env.appUrl),
  title: "EffectiveSoft Bingo",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "EffectiveSoft Bingo",
    title: "Corporate Bingo",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Corporate Bingo", description: DESCRIPTION },
  // The sign-in page is the only thing a stranger can reach, and there is no
  // reason for it to turn up in a search engine.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const canHR = user ? canOpenHR(user) : false;
  const hrActive = canHR && (await hrModeOn());

  return (
    <html lang="en" className={`${inter.variable} ${rubik.variable}`}>
      <body>
        {user && <TopBar canHR={canHR} hrActive={hrActive} name={user.name} />}
        <main className="wrap">{children}</main>
        {user && <TabBar hrActive={hrActive} />}
      </body>
    </html>
  );
}
