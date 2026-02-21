"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  LogOut,
  ClipboardList,
  Image as ImageIcon,
  CheckCircle2,
  Circle
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ModeToggle } from "~/components/mode-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

const BUCKET = "todo-images";

type TodoRow = {
  id: string;
  user_id: string;
  list_id: string;
  title: string;
  is_done: boolean;
  inserted_at: string;
};

type TodoImageRow = {
  id: string;
  todo_id: string;
  user_id: string;
  list_id: string;
  path: string;
  inserted_at: string;
};

export default function TodosClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [listId, setListId] = useState<string | null>(null);

  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [shareUserId, setShareUserId] = useState("");

  const ensureList = async () => {
    const { data: mem, error: memErr } = await supabase
      .from("todo_list_members")
      .select("list_id, role")
      .order("inserted_at", { ascending: true })
      .limit(1);

    if (memErr) {
      toast.error(memErr.message);
      return;
    }

    if (mem && mem.length > 0) {
      setListId(mem[0]!.list_id);
      return;
    }

    const { data: newList, error: listErr } = await supabase
      .from("todo_lists")
      .insert({ owner_id: userId, name: "My List" })
      .select("id")
      .single();

    if (listErr) {
      toast.error(listErr.message);
      return;
    }

    const { error: mErr } = await supabase
      .from("todo_list_members")
      .insert({ list_id: newList.id, user_id: userId, role: "owner" });

    if (mErr) {
      toast.error(mErr.message);
      return;
    }

    setListId(newList.id);
  };

  const loadTodos = async (lid: string) => {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("list_id", lid)
      .order("inserted_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }
    setTodos((data ?? []) as TodoRow[]);
  };

  const loadImages = async (lid: string) => {
    const { data, error } = await supabase
      .from("todo_images")
      .select("*")
      .eq("list_id", lid)
      .order("inserted_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    const grouped: Record<string, TodoImageRow[]> = {};
    for (const img of (data ?? []) as TodoImageRow[]) {
      (grouped[img.todo_id] ??= []).push(img);
    }
    setImagesByTodo(grouped);
  };

  useEffect(() => {
    void ensureList();
  }, [supabase, userId]);

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
    if (!listId || !title.trim()) return;

    setIsSubmitting(true);
    const { error } = await supabase.from("todos").insert({
      user_id: userId,
      list_id: listId,
      title,
      is_done: false,
    });

    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    toast.success("Todo added!");
    void loadTodos(listId);
  };

  const toggleTodo = async (id: string, next: boolean) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").update({ is_done: next }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      void loadTodos(listId);
    }
  };

  const updateTitle = async (id: string, nextTitle: string) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").update({ title: nextTitle }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      void loadTodos(listId);
    }
  };

  const delTodo = async (id: string) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Todo deleted");
      void loadTodos(listId);
    }
  };

  /*
  const share = async () => {
    if (!listId) return;
    const trimmed = shareUserId.trim();
    if (!trimmed) return;

    const { error } = await supabase.from("todo_list_members").insert({
      list_id: listId,
      user_id: trimmed,
      role: "editor",
    });

    if (error) return toast.error(error.message);
    setShareUserId("");
    toast.success("Collaborator added!");
  };
  */

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary rounded-xl">
                <ClipboardList className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Task Hub</h1>
            </div>
            <p className="text-sm text-muted-foreground font-medium ml-1">Organize your daily workflow effortlessly</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <ModeToggle />
            <Button variant="outline" size="sm" onClick={logout} className="gap-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all font-medium">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Disabled Share UI section - preserved for future use
        {false && (
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 pb-4">
              <CardTitle className="text-lg">Collaborate</CardTitle>
              <CardDescription>Share by collaborator’s Supabase User UUID</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex gap-2">
                <Input
                  placeholder="Collaborator user UUID..."
                  value={shareUserId}
                  onChange={(e) => setShareUserId(e.target.value)}
                  className="bg-white"
                />
                <Button onClick={() => void share()} disabled={!listId || !shareUserId}>
                  Share
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        */}

        {/* Add Todo Section */}
        <Card className="border-none shadow-md bg-card overflow-hidden ring-1 ring-border">
          <CardContent className="p-4 sm:p-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Input
                  className="h-12 text-base border-none bg-muted focus-visible:ring-1 focus-visible:ring-ring pl-4 transition-all"
                  placeholder="What needs to be done?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addTodo()}
                />
              </div>
              <Button
                onClick={() => void addTodo()}
                disabled={!title.trim() || !listId || isSubmitting}
                className="h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all rounded-xl shadow-sm"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Task
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Todo List */}
        <div className="space-y-4">
          {todos.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border">
              <div className="inline-flex p-4 bg-muted rounded-2xl mb-4">
                <ClipboardList className="w-8 h-8 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No tasks yet</h3>
              <p className="text-muted-foreground mt-1">Get started by creating your first task above</p>
            </div>
          ) : (
            <ul className="grid gap-4">
              {todos.map((t) => (
                <li key={t.id}>
                  <Card className={`group border-border shadow-sm transition-all duration-200 hover:shadow-md hover:ring-1 hover:ring-ring/20 ${t.is_done ? 'bg-muted/50' : 'bg-card'}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => void toggleTodo(t.id, !t.is_done)}
                          className={`mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${t.is_done
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-input text-transparent hover:border-muted-foreground'
                            }`}
                        >
                          {t.is_done && <CheckCircle2 className="h-4 w-4" />}
                        </button>

                        <div className="flex-1 space-y-3">
                          <input
                            key={t.title}
                            className={`w-full bg-transparent text-lg font-medium outline-none transition-all ${t.is_done ? 'text-muted-foreground line-through' : 'text-foreground'
                              }`}
                            defaultValue={t.title}
                            onBlur={(e) => void updateTitle(t.id, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())}
                          />

                          <div className="flex items-center gap-4">
                            <TodoImageUpload
                              userId={userId}
                              todoId={t.id}
                              listId={listId}
                              onUploaded={() => loadImages(listId!)}
                            />

                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto transition-colors">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Delete Task</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to delete "{t.title}"? This action cannot be undone.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="sm:justify-end gap-2">
                                  <DialogTrigger asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogTrigger>
                                  <Button variant="destructive" onClick={() => void delTodo(t.id)}>
                                    Delete Task
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>

                          {/* Image Feed */}
                          {(imagesByTodo[t.id] ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-border mt-3">
                              {(imagesByTodo[t.id] ?? []).map((img) => {
                                const url = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
                                return (
                                  <a key={img.id} href={url} target="_blank" rel="noreferrer" className="group/img relative">
                                    <img
                                      src={url}
                                      alt="todo attachment"
                                      className="h-20 w-20 rounded-xl object-cover ring-1 ring-border group-hover/img:opacity-90 transition-all shadow-sm"
                                    />
                                    <div className="absolute inset-0 rounded-xl ring-inset ring-foreground/5 group-hover/img:ring-foreground/10" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
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

  const upload = async (file: File) => {
    if (!listId) return;

    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${todoId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });

    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }

    const { error: dbErr } = await supabase.from("todo_images").insert({
      todo_id: todoId,
      user_id: userId,
      list_id: listId,
      path,
    });

    setUploading(false);
    if (dbErr) return toast.error(dbErr.message);

    toast.success("Image uploaded!");
    await onUploaded();
  };

  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <label className={`inline-flex items-center gap-2 cursor-pointer text-xs font-semibold py-1.5 px-3 rounded-lg transition-all ${uploading
        ? 'bg-muted text-muted-foreground/50'
        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}>
        {uploading ? (
          <>
            <div className="h-3 w-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <ImageIcon className="w-3.5 h-3.5" />
            Attach Image
          </>
        )}
        <input
          type="file"
          className="hidden"
          accept="image/*"
          disabled={uploading || !listId}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
    </div>
  );
}
