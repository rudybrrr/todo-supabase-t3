"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) return setMsg(error.message);

    router.push("/todos");
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-md p-6 space-y-3">
      <h1 className="text-2xl font-semibold">Login</h1>

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
        onClick={login}
      >
        {loading ? "..." : "Login"}
      </button>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </main>
  );
}
