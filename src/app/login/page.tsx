"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setMsg(null);

    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) return setMsg(error.message);

    router.push("/todos");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg border border-slate-200 p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Todo App</h1>
          <p className="text-sm text-slate-500">Login or create an account to continue.</p>
        </div>

        <div className="flex gap-2">
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${mode === "login" ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"
              }`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${mode === "register" ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"
              }`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Password</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <button
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition"
          disabled={loading || !email || !password}
          onClick={submit}
        >
          {loading ? "..." : mode === "login" ? "Login" : "Create account"}
        </button>

        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </div>
    </main>
  );

}
