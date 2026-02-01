"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

type TodoRow = {
    id: string;
    user_id: string;
    title: string;
    is_done: boolean;
    inserted_at: string;
};

type TodoImageRow = {
    id: string;
    todo_id: string;
    user_id: string;
    path: string;
    inserted_at: string;
};

export default function TodosClient({ userId }: { userId: string }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [todos, setTodos] = useState<TodoRow[]>([]);
    const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
    const [title, setTitle] = useState("");
    const [msg, setMsg] = useState<string | null>(null);

    const load = async () => {
        setMsg(null);
        const { data, error } = await supabase
            .from("todos")
            .select("*")
            .order("inserted_at", { ascending: false });

        if (error) return setMsg(error.message);
        setTodos(data ?? []);
    };

    const loadImages = async () => {
        const { data, error } = await supabase
            .from("todo_images")
            .select("*")
            .order("inserted_at", { ascending: false });

        if (error) {
            setMsg(error.message);
            return;
        }

        const grouped: Record<string, TodoImageRow[]> = {};
        for (const img of data ?? []) {
            (grouped[img.todo_id] ??= []).push(img);
        }
        setImagesByTodo(grouped);
    };

    useEffect(() => {
        void load();
        void loadImages();

        const todosChannel = supabase
            .channel(`todos-realtime-${userId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todos", filter: `user_id=eq.${userId}` },
                () => void load(),
            )
            .subscribe();

        const imagesChannel = supabase
            .channel(`todo-images-realtime-${userId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todo_images", filter: `user_id=eq.${userId}` },
                () => void loadImages(),
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(todosChannel);
            void supabase.removeChannel(imagesChannel);
        };
    }, [supabase, userId]);

    const addTodo = async () => {
        setMsg(null);
        const { error } = await supabase.from("todos").insert({
            user_id: userId,
            title,
            is_done: false,
        });

        if (error) return setMsg(error.message);
        setTitle("");
        void load();
    };

    const toggleTodo = async (id: string, next: boolean) => {
        const { error } = await supabase.from("todos").update({ is_done: next }).eq("id", id);
        if (error) setMsg(error.message);
        else void load();
    };

    const updateTitle = async (id: string, nextTitle: string) => {
        const { error } = await supabase.from("todos").update({ title: nextTitle }).eq("id", id);
        if (error) setMsg(error.message);
        else void load();
    };

    const delTodo = async (id: string) => {
        const { error } = await supabase.from("todos").delete().eq("id", id);
        if (error) setMsg(error.message);
        else void load();
    };

    const logout = async () => {
        await supabase.auth.signOut();
        window.location.href = "/login";
    };

    return (
        <main className="mx-auto max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Todos</h1>
                <button className="border rounded px-3 py-2" onClick={logout}>
                    Logout
                </button>
            </div>

            <div className="flex gap-2">
                <input
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="New todo..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <button
                    className="bg-black text-white rounded px-3 py-2 disabled:opacity-60"
                    disabled={!title}
                    onClick={() => void addTodo()}
                >
                    Add
                </button>
            </div>

            {msg && <p className="text-sm text-red-600">{msg}</p>}

            <ul className="space-y-2">
                {todos.map((t) => (
                    <li key={t.id} className="border rounded p-3 space-y-2">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={t.is_done}
                                onChange={(e) => void toggleTodo(t.id, e.target.checked)}
                            />

                            <input
                                key={t.title}
                                className="flex-1 border rounded px-2 py-1"
                                defaultValue={t.title}
                                onBlur={(e) => void updateTitle(t.id, e.target.value)}
                            />

                            <button className="border rounded px-3 py-1" onClick={() => void delTodo(t.id)}>
                                Delete
                            </button>
                        </div>

                        <TodoImageUpload userId={userId} todoId={t.id} onUploaded={loadImages} />

                        {(imagesByTodo[t.id] ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {(imagesByTodo[t.id] ?? []).map((img) => {
                                    const url =
                                        supabase.storage.from("todo-images")
                                            .getPublicUrl(img.path).data.publicUrl;

                                    return (
                                        <a key={img.id} href={url} target="_blank" rel="noreferrer">
                                            <img
                                                src={url}
                                                alt="todo"
                                                className="h-20 w-20 rounded object-cover border"
                                            />
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </main>
    );
}

function TodoImageUpload({
    userId,
    todoId,
    onUploaded,
}: {
    userId: string;
    todoId: string;
    onUploaded: () => Promise<void> | void;
}) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [uploading, setUploading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const upload = async (file: File) => {
        setUploading(true);
        setMsg(null);

        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${todoId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage.from("todo-images")
            .upload(path, file, {
                upsert: false,
            });

        if (upErr) {
            setUploading(false);
            return setMsg(upErr.message);
        }

        const { error: dbErr } = await supabase.from("todo_images").insert({
            todo_id: todoId,
            user_id: userId,
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
                disabled={uploading}
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
