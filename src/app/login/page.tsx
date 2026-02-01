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
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Todo App</h1>

      <div className="flex gap-2">
        <button
          className={`px-3 py-2 rounded ${mode === "login" ? "bg-black text-white" : "border"}`}
          onClick={() => setMode("login")}
        >
          Login
        </button>
        <button
          className={`px-3 py-2 rounded ${mode === "register" ? "bg-black text-white" : "border"}`}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>

      <input
        className="w-full border rounded px-3 py-2"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-60"
        disabled={loading || !email || !password}
        onClick={submit}
      >
        {loading ? "..." : mode === "login" ? "Login" : "Create account"}
      </button>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </main>
  );
}
