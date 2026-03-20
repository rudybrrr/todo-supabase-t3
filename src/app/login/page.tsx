"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);

    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(mode === "login" ? "Welcome back!" : "Account created!");
    router.push("/home");
    router.refresh();
  };

  return (
    <main className="relative min-h-screen w-full bg-background selection:bg-primary/30 lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border/60 bg-card/50 text-foreground lg:flex lg:flex-col lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,167,255,0.13),transparent_56%),linear-gradient(180deg,rgba(124,167,255,0.06)_0%,rgba(124,167,255,0.02)_24%,transparent_58%)]" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-primary/6 blur-[72px]" />

        <div className="relative z-10 flex items-center gap-3 text-xl font-bold tracking-tight">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-primary/10 text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <span>Stride</span>
        </div>

        <div className="relative z-10 flex max-w-lg flex-1 flex-col justify-center space-y-8">
          <h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
            Turn plans
            <br />
            into progress.
          </h1>
          <p className="max-w-md text-lg font-medium leading-relaxed text-muted-foreground">
            Stride helps students organize tasks, protect focus, and keep momentum across classes and deadlines.
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center bg-muted/10 p-6 sm:p-12">
        <div className="w-full max-w-[420px] space-y-8 rounded-[2rem] border border-border/60 bg-card/95 p-8 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:p-10">
          <div className="relative flex rounded-2xl border border-border/50 bg-muted/60 p-1.5">
            <button
              className={`relative z-10 flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                mode === "login"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              className={`relative z-10 flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                mode === "register"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
            <div
              className={`absolute bottom-1.5 top-1.5 w-[calc(50%-6px)] rounded-xl border border-border/50 bg-card shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition-all duration-300 ease-out ${
                mode === "login" ? "left-1.5" : "left-[calc(50%+1.5px)]"
              }`}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-sm font-medium leading-6 text-muted-foreground">
              {mode === "login"
                ? "Sign in to continue today's work."
                : "Start organizing tasks, focus blocks, and deadlines."}
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email address
              </label>
              <div className="group relative">
                <Mail className="absolute left-3.5 top-3.5 h-[18px] w-[18px] text-muted-foreground/70 transition-colors group-focus-within:text-primary" />
                <Input
                  className="h-12 rounded-xl border-input/80 bg-transparent pl-11 text-base shadow-none transition-all hover:border-border focus:border-primary"
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="group relative">
                <Lock className="absolute left-3.5 top-3.5 h-[18px] w-[18px] text-muted-foreground/70 transition-colors group-focus-within:text-primary" />
                <Input
                  className="h-12 rounded-xl border-input/80 bg-transparent pl-11 text-base shadow-none transition-all hover:border-border focus:border-primary"
                  placeholder="Enter your password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </div>
            </div>

            <Button
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold"
              disabled={loading || !email || !password}
              onClick={submit}
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : mode === "login" ? (
                <>
                  Sign in <ArrowRight className="h-5 w-5" />
                </>
              ) : (
                <>
                  Create account <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
