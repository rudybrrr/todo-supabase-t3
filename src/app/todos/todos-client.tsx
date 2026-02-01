"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

const BUCKET = "todo-images";

type TodoRow = {
  id: string;
  user_id: string;    // creator
  list_id: string;    // collaboration key
  title: string;
  is_done: boolean;
  inserted_at: string;
};

type TodoImageRow = {
  id: string;
  todo_id: string;
  user_id: string;    // uploader
  list_id: string;    // collaboration key
  path: string;
  inserted_at: string;
};

export default function TodosClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [listId, setListId] = useState<string | null>(null);

  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});

  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [shareUserId, setShareUserId] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const ensureList = async () => {
    setMsg(null);

    // Find any list you are a member of (use first one)
    const { data: mem, error: memErr } = await supabase
      .from("todo_list_members")
      .select("list_id, role")
      .order("inserted_at", { ascending: true })
      .limit(1);

    if (memErr) return setMsg(memErr.message);

    if (mem && mem.length > 0) {
      setListId(mem[0]!.list_id);
      return;
    }

    // If none exists, create a new list and add yourself as owner
    const { data: newList, error: listErr } = await supabase
      .from("todo_lists")
      .insert({ owner_id: userId, name: "My List" })
      .select("id")
      .single();

    if (listErr) return setMsg(listErr.message);

    const { error: mErr } = await supabase
      .from("todo_list_members")
      .insert({ list_id: newList.id, user_id: userId, role: "owner" });

    if (mErr) return setMsg(mErr.message);

    setListId(newList.id);
  };

  const loadTodos = async (lid: string) => {
    setMsg(null);
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("list_id", lid)
      .order("inserted_at", { ascending: false });

    if (error) return setMsg(error.message);
    setTodos((data ?? []) as TodoRow[]);
  };

  const loadImages = async (lid: string) => {
    const { data, error } = await supabase
      .from("todo_images")
      .select("*")
      .eq("list_id", lid)
      .order("inserted_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      return;
    }

    const grouped: Record<string, TodoImageRow[]> = {};
    for (const img of (data ?? []) as TodoImageRow[]) {
      (grouped[img.todo_id] ??= []).push(img);
    }
    setImagesByTodo(grouped);
  };

  // Step 1: ensure you have a listId
  useEffect(() => {
    void ensureList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId]);

  // Step 2: once listId exists, load + subscribe by list_id (collaboration!)
  useEffect(() => {
    if (!listId) return;

    void loadTodos(listId);
    void loadImages(listId);

    const todosChannel = supabase
      .channel(`todos-rt-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos", filter: `list_id=eq.${listId}` },
        () => void loadTodos(listId),
      )
      .subscribe();

    const imagesChannel = supabase
      .channel(`todo-images-rt-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todo_images", filter: `list_id=eq.${listId}` },
        () => void loadImages(listId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(todosChannel);
      void supabase.removeChannel(imagesChannel);
    };
  }, [supabase, listId]);

  const addTodo = async () => {
    if (!listId) return;

    setMsg(null);
    const { error } = await supabase.from("todos").insert({
      user_id: userId,
      list_id: listId,
      title,
      is_done: false,
    });

    if (error) return setMsg(error.message);
    setTitle("");
    void loadTodos(listId);
  };

  const toggleTodo = async (id: string, next: boolean) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").update({ is_done: next }).eq("id", id);
    if (error) setMsg(error.message);
    else void loadTodos(listId);
  };

  const updateTitle = async (id: string, nextTitle: string) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").update({ title: nextTitle }).eq("id", id);
    if (error) setMsg(error.message);
    else void loadTodos(listId);
  };

  const delTodo = async (id: string) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) setMsg(error.message);
    else void loadTodos(listId);
  };

  const share = async () => {
    if (!listId) return;
    setShareMsg(null);

    const trimmed = shareUserId.trim();
    if (!trimmed) return;

    const { error } = await supabase.from("todo_list_members").insert({
      list_id: listId,
      user_id: trimmed,
      role: "editor",
    });

    if (error) return setShareMsg(error.message);
    setShareUserId("");
    setShareMsg("Added ✅ (they can now see this list)");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-200 p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Todos</h1>
            <p className="text-sm text-slate-500">Realtime + collaborative list</p>
          </div>
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 transition"
            onClick={logout}
          >
            Logout
          </button>
        </div>

        {/* Share UI */}
        <div className="rounded-2xl bg-white shadow border border-slate-200 p-4 space-y-2">
          <div className="font-semibold">Collaborate</div>
          <div className="text-xs text-slate-500">
            Share by collaborator’s Supabase User UUID (Auth → Users).
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Collaborator user UUID..."
              value={shareUserId}
              onChange={(e) => setShareUserId(e.target.value)}
            />
            <button
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition"
              onClick={() => void share()}
              disabled={!listId || !shareUserId}
            >
              Share
            </button>
          </div>

          {shareMsg && <p className="text-sm text-slate-700">{shareMsg}</p>}
        </div>

        <div className="rounded-2xl bg-white shadow border border-slate-200 p-4">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="New todo..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button
              className="rounded-lg bg-slate-900 text-white px-4 py-2 font-medium hover:bg-slate-800 disabled:opacity-50 transition"
              disabled={!title || !listId}
              onClick={() => void addTodo()}
            >
              Add
            </button>
          </div>
        </div>

        {msg && <p className="text-sm text-red-600">{msg}</p>}

        <ul className="space-y-2">
          {todos.map((t) => (
            <li key={t.id} className="rounded-2xl bg-white shadow border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-slate-900"
                  checked={t.is_done}
                  onChange={(e) => void toggleTodo(t.id, e.target.checked)}
                />

                <input
                  key={t.title}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                  defaultValue={t.title}
                  onBlur={(e) => void updateTitle(t.id, e.target.value)}
                />

                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 transition"
                  onClick={() => void delTodo(t.id)}
                >
                  Delete
                </button>
              </div>

              <TodoImageUpload
                userId={userId}
                todoId={t.id}
                listId={listId}
                onUploaded={() => loadImages(listId!)}
              />

              {(imagesByTodo[t.id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(imagesByTodo[t.id] ?? []).map((img) => {
                    const url = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
                    return (
                      <a key={img.id} href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt="todo"
                          className="h-20 w-20 rounded-xl object-cover border border-slate-200 hover:opacity-90 transition"
                        />
                      </a>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function TodoImageUpload({
  userId,
  todoId,
  listId,
  onUploaded,
}: {
  userId: string;
  todoId: string;
  listId: string | null;
  onUploaded: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (!listId) return;

    setUploading(true);
    setMsg(null);

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${todoId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });

    if (upErr) {
      setUploading(false);
      return setMsg(upErr.message);
    }

    const { error: dbErr } = await supabase.from("todo_images").insert({
      todo_id: todoId,
      user_id: userId,
      list_id: listId,
      path,
    });

    setUploading(false);
    if (dbErr) return setMsg(dbErr.message);

    setMsg("Uploaded ✅");
    await onUploaded();
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="file"
        accept="image/*"
        disabled={uploading || !listId}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {uploading && <span className="text-sm">Uploading...</span>}
      {msg && <span className="text-sm">{msg}</span>}
    </div>
  );
}
