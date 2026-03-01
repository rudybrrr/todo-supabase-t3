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
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { ModeToggle } from "~/components/mode-toggle";
import { ListSidebar } from "./list-sidebar";
import { FocusTimer } from "./focus-timer";
import { useFocus } from "~/components/focus-provider";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { Separator } from "~/components/ui/separator";
import { TodoImageUpload } from "./todo-image-upload";
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
import type { TodoList, TodoRow, TodoImageRow } from "~/lib/types";

const BUCKET = "todo-images";

import { useData } from "~/components/data-provider";

export default function TodosClient({ userId }: { userId: string, username?: string }) {
  const { lists, profile, loading: dataLoading, refreshData } = useData();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [listId, setListId] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setCurrentListId } = useFocus();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Initialize listId from URL or fallback to first list
  useEffect(() => {
    if (dataLoading) return;

    const urlListId = searchParams.get("listId");
    if (urlListId) {
      setListId(urlListId);
    } else if (lists.length > 0 && !listId) {
      setListId(lists[0]!.id);
    }
  }, [searchParams, lists, dataLoading]);

  // Sync state to URL
  const handleListSelect = useCallback((id: string) => {
    setListId(id);
    const params = new URLSearchParams(searchParams);
    params.set("listId", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setCurrentListId(listId);
  }, [listId, setCurrentListId]);

  const [open, setOpen] = useState(false);

  // We still need to load todos for the specific list
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
    if (!listId) return;

    void loadTodos(listId);
    void loadImages(listId);

    const todosChannel = supabase
      .channel(`todos-rt-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos" },
        () => void loadTodos(listId),
      )
      .subscribe();

    const imagesChannel = supabase
      .channel(`todo-images-rt-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todo_images" },
        () => void loadImages(listId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(todosChannel);
      void supabase.removeChannel(imagesChannel);
    };
  }, [supabase, listId, loadTodos, loadImages]);

  const handleInvite = useCallback(async (lid: string) => {
    const email = prompt("Enter the email of the student you want to invite:");
    if (!email) return;

    // 1. Find user by email in profiles
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (profErr) return toast.error(profErr.message);
    if (!profile) return toast.error("No student found with that email. Ask them to log in first!");

    // 2. Add to todo_list_members
    const { error: memErr } = await supabase
      .from("todo_list_members")
      .insert({
        list_id: lid,
        user_id: profile.id,
        role: "editor"
      });

    if (memErr) {
      if (memErr.code === "23505") {
        toast.error("This student is already a member of the project.");
      } else {
        toast.error(memErr.message);
      }
      return;
    }

    toast.success(`Invited ${email} successfully!`);
  }, [supabase]);

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
    void refreshData();
    setListId(newList.id);
  }, [supabase, userId, refreshData]);

  const deleteList = useCallback(async (lid: string) => {
    const listToDelete = lists.find(l => l.id === lid);
    if (listToDelete?.name === "Inbox") {
      toast.error("The Inbox is a permanent project and cannot be deleted.");
      return;
    }

    const isOwner = listToDelete?.owner_id === userId;

    if (isOwner) {
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
        void refreshData();
      }
    } else {
      if (!confirm("Are you sure you want to leave this shared project?")) return;

      const { error } = await supabase
        .from("todo_list_members")
        .delete()
        .eq("list_id", lid)
        .eq("user_id", userId);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("You have left the project");
        if (listId === lid) setListId(null);
        void refreshData();
      }
    }
  }, [supabase, lists, listId, userId, refreshData]);

  const addTodo = useCallback(async () => {
    if (!listId || !title.trim()) return;

    setIsSubmitting(true);
    const newTodo: TodoRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      list_id: listId,
      title,
      is_done: false,
      inserted_at: new Date().toISOString()
    };

    // Optimistic Update
    setTodos(prev => [newTodo, ...prev]);
    setTitle("");

    const { error } = await supabase.from("todos").insert({
      user_id: userId,
      list_id: listId,
      title: newTodo.title,
      is_done: false,
    });

    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      // Rollback
      void loadTodos(listId);
      return;
    }
    toast.success("Todo added!");
  }, [supabase, listId, title, userId, loadTodos]);

  const toggleTodo = useCallback(async (id: string, next: boolean) => {
    if (!listId) return;

    // Optimistic Update
    setTodos(prev => prev.map(t => t.id === id ? { ...t, is_done: next } : t));

    if (next) {
      void confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.8 },
        colors: ['#de483a', '#10b981']
      });
    }

    const { error } = await supabase.from("todos").update({ is_done: next }).eq("id", id);
    if (error) {
      toast.error(error.message);
      void loadTodos(listId);
    }
  }, [supabase, listId, loadTodos]);

  const updateTitle = useCallback(async (id: string, nextTitle: string) => {
    if (!listId) return;

    // Optimistic Update
    setTodos(prev => prev.map(t => t.id === id ? { ...t, title: nextTitle } : t));

    const { error } = await supabase.from("todos").update({ title: nextTitle }).eq("id", id);
    if (error) {
      toast.error(error.message);
      void loadTodos(listId);
    }
  }, [supabase, listId, loadTodos]);

  const delTodo = useCallback(async (id: string) => {
    if (!listId) return;

    // Optimistic Update
    setTodos(prev => prev.filter(t => t.id !== id));

    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      void loadTodos(listId);
    } else {
      toast.success("Todo deleted");
    }
  }, [supabase, listId, loadTodos]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);


  const completedCount = useMemo(() => todos.filter(t => t.is_done).length, [todos]);
  const progress = useMemo(() => todos.length > 0 ? (completedCount / todos.length) * 100 : 0, [todos.length, completedCount]);

  const currentList = useMemo(() => lists.find(l => l.id === listId), [lists, listId]);

  return (
    <div className="flex min-h-screen bg-transparent">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-80 flex-col fixed inset-y-0 shadow-xl glass z-20 border-r">
        <ListSidebar
          lists={lists}
          activeListId={listId}
          onListSelect={handleListSelect}
          onCreateList={addList}
          onDeleteList={deleteList}
          onInvite={handleInvite}
          onLogout={logout}
          userId={userId}
          username={profile?.username}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-80 flex flex-col min-h-screen">
        <div className="mx-auto w-full max-w-3xl p-4 md:p-8 space-y-6">
          {/* Header Section */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pt-8 pb-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="lg:hidden h-10 w-10 -ml-3 text-muted-foreground hover:text-foreground">
                      <Menu className="h-6 w-6" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-72 border-none">
                    <SheetHeader className="sr-only">
                      <SheetTitle>Navigation Menu</SheetTitle>
                      <SheetDescription>Access your study lists and settings</SheetDescription>
                    </SheetHeader>
                    <ListSidebar
                      lists={lists}
                      activeListId={listId}
                      onListSelect={(id) => {
                        handleListSelect(id);
                        setOpen(false);
                      }}
                      onCreateList={() => {
                        void addList();
                        setOpen(false);
                      }}
                      onDeleteList={(id) => {
                        void deleteList(id);
                        setOpen(false);
                      }}
                      onInvite={(lid) => {
                        void handleInvite(lid);
                        setOpen(false);
                      }}
                      onLogout={() => {
                        void logout();
                        setOpen(false);
                      }}
                      userId={userId}
                      username={profile?.username}
                    />
                  </SheetContent>
                </Sheet>
                <h1 className="text-3xl font-bold tracking-tight text-foreground lg:-ml-1">
                  {currentList?.name ?? "Study Sprint"}
                </h1>
              </div>
              {currentList?.name === "Inbox" && (
                <p className="text-[15px] text-muted-foreground lg:ml-0">Keep track of your immediate thoughts and tasks.</p>
              )}
            </div>

            {/* Things 3 Style Circular Progress */}
            {todos.length > 0 && (
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:mb-2">
                <div
                  className="relative h-5 w-5 rounded-full overflow-hidden border-2 border-muted"
                  style={{
                    background: `conic-gradient(var(--primary) ${progress}%, transparent ${progress}%)`,
                    transform: 'rotate(-90deg)'
                  }}
                >
                  <div className="absolute inset-0 bg-transparent rounded-full border border-border/20" />
                </div>
                <span>{completedCount} of {todos.length}</span>
              </div>
            )}
          </div>

          {/* Sprint Mode Focus Timer */}
          <FocusTimer />

          {/* Add Todo Section */}
          <div className="relative group/add mb-6">
            <div className="flex items-center gap-3 p-1 rounded-xl transition-all border border-transparent focus-within:border-border/60 focus-within:bg-muted/20 focus-within:shadow-sm">
              <Plus className="w-5 h-5 text-muted-foreground/40 ml-2 group-focus-within/add:text-primary transition-colors" />
              <Input
                className="h-10 text-[15px] p-0 font-medium border-none bg-transparent dark:bg-transparent focus-visible:ring-0 shadow-none outline-none placeholder:text-muted-foreground/50 placeholder:font-normal"
                placeholder="New To-Do"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addTodo()}
              />
              {title.trim() && (
                <Button
                  onClick={() => void addTodo()}
                  disabled={!title.trim() || !listId || isSubmitting}
                  size="sm"
                  className="h-8 mr-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all rounded-[8px]"
                >
                  Save
                </Button>
              )}
            </div>
            <Separator className="mt-2 bg-border/50" />
          </div>

          {/* Todo List */}
          <div className="space-y-1">
            {todos.length === 0 ? (
              <div className="text-center py-20 flex flex-col items-center">
                <motion.div
                  className="relative mb-6"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="absolute inset-0 bg-primary/5 rounded-full blur-3xl animate-pulse" />
                  <div className="relative p-5 bg-muted/50 rounded-full border border-border/20">
                    <Layout className="w-10 h-10 text-muted-foreground/40" />
                  </div>
                </motion.div>
                <h3 className="text-xl font-bold text-foreground">Clear Horizon</h3>
                <p className="text-[15px] text-muted-foreground mt-2 max-w-xs mx-auto">
                  No active missions. Ignite your productivity by adding your first task above.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                <AnimatePresence mode="popLayout" initial={false}>
                  {todos.map((t) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, x: -10, transition: { duration: 0.15 } }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="group relative"
                    >
                      <div className={`flex flex-col py-2.5 transition-all outline-none rounded-xl hover:bg-muted/40 px-2 -mx-2 ${t.is_done ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-3 w-full">
                          <button
                            onClick={() => void toggleTodo(t.id, !t.is_done)}
                            className={`mt-[3px] h-5 w-5 rounded-full border-[1.5px] flex-shrink-0 flex items-center justify-center transition-all duration-200 ${t.is_done
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/30 hover:border-primary/60'
                              }`}
                          >
                            {t.is_done && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
                          </button>

                          <div className="flex-1 min-w-0 space-y-2">
                            <input
                              key={t.title}
                              className={`w-full bg-transparent text-[15px] outline-none transition-all truncate block ${t.is_done ? 'text-muted-foreground/60 line-through font-normal' : 'text-foreground font-medium'
                                }`}
                              defaultValue={t.title}
                              onBlur={(e) => void updateTitle(t.id, e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())}
                            />

                            <div className="flex items-center gap-2">
                              {/* Interaction Icons that appear on hover */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                                <TodoImageUpload
                                  userId={userId}
                                  todoId={t.id}
                                  listId={listId}
                                  onUploaded={() => loadImages(listId!)}
                                />

                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-md">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-md border-none shadow-2xl rounded-3xl">
                                    <DialogHeader>
                                      <DialogTitle className="text-xl font-bold">Retire Task</DialogTitle>
                                      <DialogDescription className="text-muted-foreground">
                                        Are you sure you want to remove "{t.title}"? This cannot be undone.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter className="sm:justify-end gap-3 mt-4">
                                      <DialogTrigger asChild>
                                        <Button variant="outline" className="rounded-xl border-border">Cancel</Button>
                                      </DialogTrigger>
                                      <Button variant="destructive" className="rounded-xl bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/20" onClick={() => void delTodo(t.id)}>
                                        Delete
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>

                            {/* Image Feed */}
                            {(imagesByTodo[t.id] ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-2 mt-1">
                                {(imagesByTodo[t.id] ?? []).map((img) => {
                                  const url = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
                                  return (
                                    <a key={img.id} href={url} target="_blank" rel="noreferrer" className="group/img relative">
                                      <img
                                        src={url}
                                        alt="todo attachment"
                                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-border/50 group-hover/img:scale-105 transition-all shadow-sm group-hover/img:shadow-md"
                                      />
                                      <div className="absolute inset-0 rounded-xl ring-inset ring-foreground/5 transition-all" />
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <Separator className="absolute bottom-0 left-9 right-2 bg-border/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </main >
    </div >
  );
}

