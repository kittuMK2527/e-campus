import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { QueryProvider } from "@/context/QueryProvider";
import { ToastProvider } from "@/context/ToastContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Self-hosted by next/font. Both Outfit and Plus Jakarta Sans are variable fonts,
// so omitting the explicit weight array lets next/font load the single full-range
// variable font file without triggering Turbopack's multi-weight query bug.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FACE Prep E-Campus - Operations & Timetable System",
  description: "Advanced Slot Booking, Operations, and Student Academic Management Platform",
  icons: {
    icon: "/faceprep-fav.png",
    shortcut: "/faceprep-fav.png",
    apple: "/faceprep-fav.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Without viewport-fit=cover every env(safe-area-inset-*) in the app resolves
  // to zero, so the phone bottom bar sat under the iOS home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${jakartaSans.variable} h-full antialiased`}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col transition-colors duration-250">
        <ToastProvider>
          <QueryProvider>
            <AppProvider>
              {children}
            </AppProvider>
          </QueryProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
