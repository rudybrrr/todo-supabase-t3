"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import TodosClient from "./todos-client";

export default function TodosGate() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUserId(data.user.id);
      setLoading(false);
    };
    void run();
  }, [router, supabase]);

  if (loading) return <main className="min-h-screen bg-background p-6 flex items-center justify-center text-muted-foreground font-medium animate-pulse">Loading Hub...</main>;
  if (!userId) return null;

  return <TodosClient userId={userId} />;
}
