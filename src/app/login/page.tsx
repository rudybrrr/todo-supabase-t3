"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { toast } from "sonner";
import { LogIn, UserPlus, Mail, Lock } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";

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
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-none shadow-xl ring-1 ring-border">
        <CardHeader className="space-y-1 pb-8 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Study Sprint</CardTitle>
          <CardDescription className="text-muted-foreground">
            {mode === "login" ? "Welcome back! Login to your account" : "Join us! Create your account to start"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex p-1 bg-muted rounded-xl">
            <button
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === "login"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              onClick={() => setMode("login")}
            >
              <LogIn className="w-4 h-4" />
              Login
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === "register"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              onClick={() => setMode("register")}
            >
              <UserPlus className="w-4 h-4" />
              Register
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground/80 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-10 h-11 bg-muted/30 border-border focus:bg-card transition-all"
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground/80 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-10 h-11 bg-muted/30 border-border focus:bg-card transition-all"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-2 pb-8">
          <Button
            className="w-full h-11 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all rounded-xl"
            disabled={loading || !email || !password}
            onClick={submit}
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
