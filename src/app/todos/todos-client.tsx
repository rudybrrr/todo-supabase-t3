"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  LogOut,
  ClipboardList,
  Image as ImageIcon,
  CheckCircle2,
  Circle,
  TrendingUp,
  Target,
  Layout,
  Menu,
  Hash
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ModeToggle } from "~/components/mode-toggle";
import { ListSidebar } from "./list-sidebar";
import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet";
import { Separator } from "~/components/ui/separator";
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

type TodoList = {
  id: string;
  name: string;
  owner_id: string;
  inserted_at: string;
};

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
  const [lists, setLists] = useState<TodoList[]>([]);

  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [shareUserId, setShareUserId] = useState("");

  const loadLists = async () => {
    // Get lists where user is a member
    const { data: members, error: memErr } = await supabase
      .from("todo_list_members")
      .select("list_id, todo_lists(*)")
      .eq("user_id", userId);

    if (memErr) {
      toast.error(memErr.message);
      return;
    }

    const userLists = (members ?? []).map(m => (m as any).todo_lists as TodoList);
    setLists(userLists);

    if (!listId && userLists.length > 0) {
      setListId(userLists[0]!.id);
    }
  };

  const ensureList = async () => {
    const { data: mem, error: memErr } = await supabase
      .from("todo_list_members")
      .select("list_id")
      .eq("user_id", userId)
      .limit(1);

    if (memErr) {
      toast.error(memErr.message);
      return;
    }

    if (mem && mem.length > 0) {
      void loadLists();
      return;
    }

    // Double check if an "Inbox" already exists for this owner to prevent unique constraint violations
    const { data: existingInbox } = await supabase
      .from("todo_lists")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", "Inbox")
      .maybeSingle();

    if (existingInbox) {
      // If list exists but member record was missing, fix the member record
      await supabase.from("todo_list_members").upsert({ list_id: existingInbox.id, user_id: userId, role: "owner" });
      void loadLists();
      return;
    }

    const { data: newList, error: listErr } = await supabase
      .from("todo_lists")
      .insert({ owner_id: userId, name: "Inbox" })
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

    void loadLists();
  };

  const loadTodos = useCallback(async (lid: string) => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, user_id, list_id, title, is_done, inserted_at")
      .eq("list_id", lid)
      .order("inserted_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }
    setTodos((data ?? []) as TodoRow[]);
  }, [supabase]);

  const loadImages = useCallback(async (lid: string) => {
    const { data, error } = await supabase
      .from("todo_images")
      .select("id, todo_id, path, list_id")
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
  }, [supabase]);

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
  }, [supabase, listId, loadTodos, loadImages]);

  const addList = useCallback(async () => {
    const name = prompt("Enter list name:");
    if (!name) return;

    const { data: newList, error: listErr } = await supabase
      .from("todo_lists")
      .insert({ owner_id: userId, name })
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

    toast.success("Project created!");
    void loadLists();
    setListId(newList.id);
  }, [supabase, userId, loadLists]);

  const deleteList = useCallback(async (lid: string) => {
    const listToDelete = lists.find(l => l.id === lid);
    if (listToDelete?.name === "Inbox") {
      toast.error("The Inbox is a permanent project and cannot be deleted.");
      return;
    }

    if (!confirm("Are you sure? All tasks and data in this project will be permanently erased.")) return;

    // Manually cleanup dependencies to ensure delete succeeds if CASCADE is not set
    const { error: todoErr } = await supabase.from("todos").delete().eq("list_id", lid);
    if (todoErr) return toast.error(todoErr.message);

    const { error: memErr } = await supabase.from("todo_list_members").delete().eq("list_id", lid);
    if (memErr) return toast.error(memErr.message);

    // Finally delete the list itself
    const { error } = await supabase.from("todo_lists").delete().eq("id", lid);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Project and all associated data deleted");
      if (listId === lid) setListId(null);
      void loadLists();
    }
  }, [supabase, lists, listId, loadLists]);

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

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

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

  const completedCount = useMemo(() => todos.filter(t => t.is_done).length, [todos]);
  const progress = useMemo(() => todos.length > 0 ? (completedCount / todos.length) * 100 : 0, [todos.length, completedCount]);

  const currentList = useMemo(() => lists.find(l => l.id === listId), [lists, listId]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col fixed inset-y-0 shadow-sm">
        <ListSidebar
          lists={lists}
          activeListId={listId}
          onListSelect={setListId}
          onCreateList={addList}
          onDeleteList={deleteList}
          onLogout={logout}
          userId={userId}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:pl-72 flex flex-col">
        <div className="mx-auto w-full max-w-3xl p-4 md:p-8 space-y-6">
          {/* Header Section */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card p-6 rounded-2xl shadow-sm border border-border">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="md:hidden h-10 w-10 mr-2 bg-card border-border shadow-sm hover:text-primary transition-all">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-72 border-none">
                    <ListSidebar
                      lists={lists}
                      activeListId={listId}
                      onListSelect={setListId}
                      onCreateList={addList}
                      onDeleteList={deleteList}
                      onLogout={logout}
                      userId={userId}
                    />
                  </SheetContent>
                </Sheet>
                <div className="p-2 bg-primary rounded-xl">
                  <Target className="w-5 h-5 text-primary-foreground" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground truncate max-w-[200px]">
                  {currentList?.name ?? "Study Sprint"}
                </h1>
              </div>
              {currentList?.name === "Inbox" && (
                <p className="text-sm text-muted-foreground font-medium ml-1">Your quick-access brain dump for immediate tasks</p>
              )}
            </div>
          </div>

          {/* Progress Stats Bar */}
          <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
            <div className="flex items-center justify-between mb-3 text-sm font-semibold">
              <div className="flex items-center gap-2 text-foreground">
                <TrendingUp className="w-4 h-4 text-primary" />
                Focus
              </div>
              <div className="text-muted-foreground">
                {completedCount}/{todos.length} Completed
              </div>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Add Todo Section */}
          <Card className="border-none shadow-md bg-card overflow-hidden ring-1 ring-border">
            <CardContent className="p-4 sm:p-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Input
                    className="h-12 text-base border-none bg-muted focus-visible:ring-1 focus-visible:ring-ring pl-4 transition-all"
                    placeholder="Plan your next victory..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void addTodo()}
                  />
                </div>
                <Button
                  onClick={() => void addTodo()}
                  disabled={!title.trim() || !listId || isSubmitting}
                  className="h-12 px-6 bg-primary hover:bg-primary/95 text-primary-foreground font-bold transition-all rounded-xl shadow-lg active:scale-95"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Action
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Todo List */}
          <div className="space-y-4">
            {todos.length === 0 ? (
              <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border flex flex-col items-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl animate-pulse" />
                  <div className="relative p-6 bg-muted rounded-3xl">
                    <Layout className="w-12 h-12 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-foreground">Clear Horizon</h3>
                <p className="text-muted-foreground mt-2 max-w-xs mx-auto">
                  No active missions. Ignite your productivity by adding your first task above.
                </p>
                <Button
                  variant="outline"
                  className="mt-6 rounded-xl border-dashed border-2 hover:border-primary text-muted-foreground hover:text-primary transition-all"
                  onClick={() => document.querySelector('input')?.focus()}
                >
                  Start Your Day
                </Button>
              </div>
            ) : (
              <ul className="grid gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {todos.map((t) => (
                  <li key={t.id} className="transition-all hover:translate-x-1 duration-200">
                    <Card className={`group border-border/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/20 ${t.is_done ? 'bg-muted/40 opacity-75' : 'bg-card'}`}>
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-4">
                          <button
                            onClick={() => void toggleTodo(t.id, !t.is_done)}
                            className={`mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${t.is_done
                              ? 'bg-primary border-primary text-primary-foreground scale-110 shadow-lg shadow-primary/20'
                              : 'border-input text-transparent hover:border-primary/50'
                              }`}
                          >
                            {t.is_done && <CheckCircle2 className="h-4 w-4" />}
                          </button>

                          <div className="flex-1 space-y-3">
                            <input
                              key={t.title}
                              className={`w-full bg-transparent text-lg font-semibold outline-none transition-all ${t.is_done ? 'text-muted-foreground line-through' : 'text-foreground hover:text-primary/90'
                                }`}
                              defaultValue={t.title}
                              onBlur={(e) => void updateTitle(t.id, e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())}
                            />

                            <div className="flex items-center gap-3">
                              <TodoImageUpload
                                userId={userId}
                                todoId={t.id}
                                listId={listId}
                                onUploaded={() => loadImages(listId!)}
                              />

                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 ml-auto transition-all rounded-lg opacity-0 group-hover:opacity-100">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md border-none shadow-2xl rounded-3xl">
                                  <DialogHeader>
                                    <DialogTitle className="text-xl font-bold">Retire Task</DialogTitle>
                                    <DialogDescription className="text-muted-foreground">
                                      Are you sure you want to remove "{t.title}"? This mission record will be deleted permanently.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter className="sm:justify-end gap-3 mt-4">
                                    <DialogTrigger asChild>
                                      <Button variant="outline" className="rounded-xl border-border">Keep Mission</Button>
                                    </DialogTrigger>
                                    <Button variant="destructive" className="rounded-xl bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/20" onClick={() => void delTodo(t.id)}>
                                      Confirm Removal
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>

                            {/* Image Feed */}
                            {(imagesByTodo[t.id] ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-2.5 pt-3 border-t border-border/10 mt-3">
                                {(imagesByTodo[t.id] ?? []).map((img) => {
                                  const url = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
                                  return (
                                    <a key={img.id} href={url} target="_blank" rel="noreferrer" className="group/img relative">
                                      <img
                                        src={url}
                                        alt="todo attachment"
                                        className="h-20 w-20 rounded-2xl object-cover ring-2 ring-border/50 group-hover/img:scale-105 transition-all shadow-md group-hover/img:shadow-xl group-hover/img:ring-primary/20"
                                      />
                                      <div className="absolute inset-0 rounded-2xl ring-inset ring-foreground/5 group-hover/img:bg-foreground/5 transition-all" />
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
    </div>
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
