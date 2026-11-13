"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ProfessionalLoader } from "@/components/DashboardLayout";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { setSuperAdminSession } from "@/lib/superadmin";
import { setClientCsrfToken } from "@/lib/apiFetch";
import { getRoleHomePath } from "@/lib/utils";

import {
  User,
  ShieldCheck,
  Sparkles,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff
} from "lucide-react";



export default function Home() {
  const router = useRouter();
  const {
    currentUser,
    isAuthenticated,
    currentRole,
    setRole,
    isLoading: appLoading,
    mentors,
    students,
    submitSignupRequest,
    logout
  } = useApp();

  // Login Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showForgotNote, setShowForgotNote] = useState(false);

  // Signup Mode States
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState("");

  // Check login state on mount
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!appLoading && isAuthenticated && currentUser) {
      const activeRole = currentRole || currentUser.role || "mentor";
      setIsRedirecting(true);
      router.replace(getRoleHomePath(activeRole));
      return;
    }
    
    setIsRedirecting(false);

    localStorage.removeItem("fp_dark_mode");
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, [appLoading, isAuthenticated, currentUser, currentRole, router]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (!email.trim() || !password.trim()) {
      setLoginError("Please enter both email and password.");
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.csrfToken) {
          setClientCsrfToken(data.csrfToken);
        }
        localStorage.setItem("fp_logged_in", "true");
        localStorage.setItem("fp_user_id", data.userId || "");
        const resolvedName = data.userName || data.userEmail || email.trim();
        localStorage.setItem("fp_user_email", (data.userEmail || email.trim()).toLowerCase());
        localStorage.setItem("fp_user_name", resolvedName);
        if (data.collegeId) {
          localStorage.setItem("fp_user_college_id", data.collegeId);
        } else {
          localStorage.removeItem("fp_user_college_id");
        }

        // A forced password change applies to every account, super admins included
        if (data.mustChangePassword) {
          localStorage.setItem("fp_must_change_pass", "true");
        } else {
          localStorage.removeItem("fp_must_change_pass");
        }

        const isSuperAdmin = !!data.isSuperAdmin;
        setSuperAdminSession(isSuperAdmin);

        setRole(data.role, data.userId, {
          collegeId: data.collegeId,
          userEmail: data.userEmail || email.trim(),
          userName: resolvedName,
          isSuperAdmin,
          mustChangePassword: Boolean(data.mustChangePassword)
        });

        // Navigation is handled by the auth effect above so there is a single redirect authority.
      } else {
        setLoginError(data.message || data.error || "Login failed. Please check your credentials.");
      }
    } catch {
      setLoginError("Network error. Could not connect to the server.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {    e.preventDefault();
    setSignupError("");
    setSignupSuccess("");

    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim() || !signupConfirmPassword.trim()) {
      setSignupError("Please fill out all required fields.");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match.");
      return;
    }

    setSignupLoading(true);
    try {
      const res = await submitSignupRequest({
        name: signupName.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
        requested_role: "pending",
        college_id: null,
        notes: null
      });

      if (res.success) {
        setSignupSuccess(res.message || "Signup request submitted successfully!");
        setSignupName("");
        setSignupEmail("");
        setSignupPassword("");
        setSignupConfirmPassword("");
      } else {
        setSignupError(res.message || "Failed to submit request.");
      }
    } catch {
      setSignupError("Network error. Could not connect to the server.");
    } finally {
      setSignupLoading(false);
    }
  };

  /* ── Loading Splash (Only shown during active session redirection) ─────────────────────── */
  if (isRedirecting) {
    return <ProfessionalLoader message="Redirecting to your workspace…" />;
  }



  return (
    <div className="min-h-dvh flex font-sans overflow-hidden bg-white relative">
      {/* ── LEFT HERO PANEL (LIGHT UI) ── */}
      <div className="hidden lg:flex lg:w-[50%] xl:w-[54%] flex-col relative overflow-hidden bg-slate-50 border-r border-slate-100">
        {/* Shifting dynamic glowing orb backdrops (extremely soft for Light Mode) */}
        <div className="absolute top-[-10%] left-[-10%] h-[50%] w-[50%] rounded-full bg-slate-200/20 blur-[120px] pointer-events-none animate-float-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-slate-300/10 blur-[120px] pointer-events-none animate-float-reverse" />
        <div className="absolute top-[35%] left-[35%] h-[30%] w-[30%] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none animate-pulse-gentle" />

        {/* Modern 45° Bauhaus Diagonal Micro-Hatch Pattern Overlay */}
        <div className="absolute inset-0 bg-diagonal-hatch pointer-events-none opacity-40 z-0" />

        {/* Left panel main wrapper */}
        <div className="relative z-10 flex flex-col h-full px-12 xl:px-16 py-12 justify-between">
          {/* Header Logo */}
          <div className="flex items-center gap-3">
            <img src="/E-Campus.png" alt="FACE Prep E-Campus Logo" className="h-12 sm:h-14 md:h-16 w-auto object-contain max-w-[280px]" />
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[9px] font-bold text-slate-600 uppercase tracking-wider">
              v2.0
            </span>
          </div>

          {/* Central content: Slogan */}
          <div className="space-y-6 my-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
              University Operations
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-extrabold text-slate-900 leading-[1.2] tracking-tight">
                Campus Operations &amp; <br />
                <span className="text-gradient font-black">Class Schedules,</span>
                <br />
                Simplified.
              </h1>
              <p className="text-sm text-slate-700 leading-relaxed max-w-md">
                An integrated platform to coordinate university timetables, track student academic tasks, manage fee collections, and streamline cover slot handovers.
              </p>
            </div>
          </div>

          {/* Bottom Brand Footer */}
          <div className="pt-6 border-t border-slate-200/80 flex items-center">
            <p className="text-[10px] text-slate-500 font-bold tracking-wide">
              © 2026 FACE Prep E-Campus · All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT LOGIN PANEL ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-diagonal-hatch relative justify-center">
        {/* Soft Vignette Overlay */}
        <div className="absolute inset-0 bg-radial from-transparent via-transparent to-slate-100/40 pointer-events-none z-0" />
        {/* Decorative soft glowing dots for right side */}
        <div className="absolute top-[20%] right-[-10%] h-[30%] w-[30%] rounded-full bg-slate-200/20 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-[10%] left-[-15%] h-[35%] w-[35%] rounded-full bg-slate-300/10 blur-[90px] pointer-events-none" />

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-2">
            <img src="/E-Campus.png" alt="FACE Prep E-Campus Logo" className="h-9 w-auto object-contain" />
          </div>
        </div>

        {/* Scrollable login form wrapper */}
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4 sm:p-6 md:p-12 z-10">
          <div className="w-full max-w-md space-y-6">

            {/* Welcome text */}
            <div className="space-y-1.5 text-center lg:text-left">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                {isSignupMode ? "Request Access" : "Welcome back"}
              </h2>
              <p className="text-sm text-slate-600 font-medium">
                {isSignupMode
                  ? "Submit a registration request for administrator review."
                  : "Please log in to your university workspace."}
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.02)] p-5 sm:p-8 space-y-5 sm:space-y-6">
              {isSignupMode ? (
                // --- SIGNUP FORM ---
                <form onSubmit={handleSignupSubmit} className="space-y-4">
                  {signupError && (
                    <div role="alert" className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start gap-2.5 animate-slideDown">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="font-semibold leading-relaxed">{signupError}</span>
                    </div>
                  )}

                  {signupSuccess && (
                    <div role="status" className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-600 flex items-start gap-2.5 animate-slideDown">
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="font-semibold leading-relaxed">{signupSuccess}</span>
                    </div>
                  )}

                  {/* Name Input */}
                  <div className="space-y-1">
                    <label htmlFor="signup-name" className="text-xs font-black text-slate-600 uppercase tracking-wider block">
                      Full Name
                    </label>
                    <input
                      id="signup-name"
                      type="text"
                      required
                      autoComplete="name"
                      placeholder="John Doe"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all shadow-2xs"
                      disabled={signupLoading}
                    />
                  </div>

                  {/* Email Input */}
                  <div className="space-y-1">
                    <label htmlFor="signup-email" className="text-xs font-black text-slate-600 uppercase tracking-wider block">
                      Email address
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="e.g. john.doe@faceprep.in"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all shadow-2xs"
                      disabled={signupLoading}
                    />
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1">
                    <label htmlFor="signup-password" className="text-xs font-black text-slate-600 uppercase tracking-wider block">
                      Password
                    </label>
                    <input
                      id="signup-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all shadow-2xs"
                      disabled={signupLoading}
                    />
                  </div>

                  {/* Re-enter Password Input */}
                  <div className="space-y-1">
                    <label htmlFor="signup-confirm-password" className="text-xs font-black text-slate-600 uppercase tracking-wider block">
                      Re-enter Password
                    </label>
                    <input
                      id="signup-confirm-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all shadow-2xs"
                      disabled={signupLoading}
                    />
                  </div>

                  {/* Submit Button */}
                  <LoadingButton
                    type="submit"
                    isLoading={signupLoading}
                    loadingText="Submitting request…"
                    variant="gradient"
                    icon={<ArrowRight className="h-4 w-4" />}
                    className="w-full py-3 rounded-xl text-sm mt-2"
                  >
                    Submit Access Request
                  </LoadingButton>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSignupMode(false);
                      setSignupError("");
                      setSignupSuccess("");
                    }}
                    className="w-full text-center text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors mt-4 cursor-pointer block"
                  >
                    Already have an account? Sign in
                  </button>
                </form>
              ) : (
                // --- LOGIN FORM ---
                <>
                  {loginError && (
                    <div id="login-error" role="alert" className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start gap-2.5 animate-slideDown">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="font-semibold leading-relaxed">{loginError}</span>
                    </div>
                  )}

                  <form onSubmit={handleLoginSubmit} className="space-y-5">
                    {/* Email Input */}
                    <div className="space-y-1.5">
                      <label htmlFor="login-email" className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                        Email address or Roll number
                      </label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-700 transition-colors pointer-events-none" />
                        <input
                          id="login-email"
                          type="text"
                          placeholder="e.g. your.name@faceprep.in"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl pl-10 pr-4 py-3 min-h-[44px] text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all shadow-2xs"
                          disabled={loginLoading}
                          autoComplete="email"
                          aria-invalid={Boolean(loginError)}
                          aria-describedby={loginError ? "login-error" : undefined}
                        />
                      </div>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-1.5">
                      <label htmlFor="login-password" className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                        Password
                      </label>
                      <div className="relative group">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-700 transition-colors pointer-events-none" />
                        <input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl pl-10 pr-11 py-3 min-h-[44px] text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all shadow-2xs"
                          disabled={loginLoading}
                          autoComplete="current-password"
                          aria-invalid={Boolean(loginError)}
                          aria-describedby={loginError ? "login-error" : undefined}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Forgot Password */}
                    <div className="flex justify-end -mt-1">
                      <button
                        type="button"
                        onClick={() => setShowForgotNote((v) => !v)}
                        aria-expanded={showForgotNote}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {showForgotNote && (
                      <p role="status" className="text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 animate-slideDown">
                        Contact your Campus Manager or Administrator to reset your password.
                      </p>
                    )}

                    {/* Sign In Button */}
                    <LoadingButton
                      id="login-submit-btn"
                      type="submit"
                      isLoading={loginLoading}
                      loadingText="Verifying credentials…"
                      variant="gradient"
                      icon={<ArrowRight className="h-4 w-4" />}
                      className="w-full py-3.5 rounded-xl text-sm mt-2"
                    >
                      Sign in to Dashboard
                    </LoadingButton>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSignupMode(true);
                        setLoginError("");
                      }}
                      className="w-full text-center text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors mt-4 cursor-pointer block"
                    >
                      Don't have an account? Request access
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-slate-600 font-semibold tracking-wide text-pretty">
              © 2026 FACE Prep E-Campus · Enterprise Scheduling Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
