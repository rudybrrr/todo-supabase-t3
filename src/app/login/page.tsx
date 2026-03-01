"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { toast } from "sonner";
import { LogIn, UserPlus, Mail, Lock, ArrowRight, Star, ShieldCheck } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

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
    router.push("/todos");
    router.refresh();
  };

  return (
    <main className="min-h-screen w-full lg:grid lg:grid-cols-2 bg-background relative selection:bg-primary/30">

      {/* Left Pane - Immersive Branding (Hidden on mobile) */}
      <div className="hidden lg:flex flex-col bg-zinc-950 text-zinc-50 p-12 relative overflow-hidden">
        {/* Ambient Background Glows */}
        <div className="absolute top-0 right-0 -mt-32 -mr-32 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] opacity-60 pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-32 -ml-32 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] opacity-50 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3 font-bold text-xl tracking-tight">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20">
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
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">
            Study Sprint
          </span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg space-y-8">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Focus deeper. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">Accomplish more.</span>
          </h1>
          <p className="text-xl text-zinc-400 font-medium leading-relaxed max-w-md">
            The next-generation study platform combining focused sprints with beautiful task management.
          </p>
        </div>
      </div>

      {/* Right Pane - Auth Form Container */}
      <div className="flex items-center justify-center p-6 sm:p-12 relative z-10 bg-muted/10">
        <div className="w-full max-w-[420px] space-y-8 p-8 sm:p-10 bg-card rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-border/50">

          {/* Custom Animated Mode Switcher */}
          <div className="relative flex p-1.5 bg-muted/60 rounded-2xl">
            <button
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-all rounded-xl ${mode === "login"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-all rounded-xl ${mode === "register"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
              onClick={() => setMode("register")}
            >
              Create Account
            </button>
            {/* Sliding highlight */}
            <div
              className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-background rounded-xl shadow-sm border border-border/20 transition-all duration-300 ease-out-expo ${mode === "login" ? "left-1.5" : "left-[calc(50%+1.5px)]"
                }`}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {mode === "login" ? "Welcome back" : "Join the sprint"}
            </h2>
            <p className="text-sm text-muted-foreground font-medium">
              {mode === "login" ? "Enter your credentials to continue" : "Setup your account to start organizing"}
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-3.5 w-[18px] h-[18px] text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
                <Input
                  className="pl-11 h-12 bg-transparent border-input/80 hover:border-border focus:border-primary transition-all rounded-xl text-base shadow-sm"
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-3.5 w-[18px] h-[18px] text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
                <Input
                  className="pl-11 h-12 bg-transparent border-input/80 hover:border-border focus:border-primary transition-all rounded-xl text-base shadow-sm"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </div>
            </div>

            <Button
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 rounded-xl mt-6 flex items-center justify-center gap-2 group"
              disabled={loading || !email || !password}
              onClick={submit}
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : mode === "login" ? (
                <>Sign In <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
              ) : (
                <>Create Account <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
              )}
            </Button>
          </div>

        </div>
      </div>
    </main>
  );
}
