"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, RefreshCcw } from "lucide-react";

// Dynamically import Lottie component (Client-side rendering only)
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export default function NotFound() {
  const router = useRouter();
  const [animationData, setAnimationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetch the exact Lottie JSON directly from the user's LottieHost URL
  useEffect(() => {
    fetch("https://lottie.host/5f0e17de-a8bc-4462-82ea-3defc65cb7d2/SYZZOWswu4.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Lottie animation");
        return res.json();
      })
      .then((data) => {
        setAnimationData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading Lottie animation:", err);
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-dvh w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8 relative overflow-hidden transition-colors duration-300 select-none">
      
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-cyan-500/10 via-sky-400/5 to-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-auto text-center flex flex-col items-center">
        
        {/* Exact Lottie Animation Container */}
        <div className="relative w-full max-w-[320px] sm:max-w-[380px] aspect-square flex items-center justify-center mb-2">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium animate-pulse">
              <RefreshCcw className="w-5 h-5 animate-spin text-cyan-500" />
              <span>Loading Animation...</span>
            </div>
          ) : animationData ? (
            <Lottie
              animationData={animationData}
              loop={true}
              autoplay={true}
              className="w-full h-full object-contain filter drop-shadow-md"
            />
          ) : (
            /* Backup visual if offline */
            <div className="text-8xl font-black text-slate-300 dark:text-slate-700">
              404
            </div>
          )}
        </div>

        {/* Clean Typography */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
          Page Not Found
        </h1>
        
        {/* Subtitle */}
        <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm max-w-xs sm:max-w-sm mb-6 leading-relaxed">
          The page you are looking for doesn&apos;t exist, has been removed, or is temporarily unavailable.
        </p>

        {/* Clean Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-xs sm:max-w-md">
          <button
            onClick={() => router.back()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold transition-all duration-200 shadow-xs cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold transition-all duration-200 shadow-md cursor-pointer active:scale-95"
          >
            <Home className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

      </div>
    </main>
  );
}
