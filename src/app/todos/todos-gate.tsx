"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import TodosClient from "./todos-client";
import TodosSkeleton from "./todos-skeleton";

export default function TodosGate() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .single();

      setUserId(data.user.id);
      setUsername(profile?.username);
      setLoading(false);
    };
    void run();
  }, [router, supabase]);

  if (loading) return <TodosSkeleton />;
  if (!userId) return null;

  return <TodosClient userId={userId} username={username} />;
}
