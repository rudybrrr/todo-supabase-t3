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

export default function TodosClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [listId, setListId] = useState<string | null>(null);
  const [lists, setLists] = useState<TodoList[]>([]);

  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setCurrentListId } = useFocus();

  useEffect(() => {
    setCurrentListId(listId);
  }, [listId, setCurrentListId]);

  const [open, setOpen] = useState(false);

  const loadLists = async () => {
    // Get lists where user is a member
    const { data: members, error: memErr } = await supabase
      .from("todo_list_members")
      .select("list_id, role, todo_lists(*)")
      .eq("user_id", userId);

    if (memErr) {
      toast.error(memErr.message);
      return;
    }

    const userLists: TodoList[] = (members ?? []).map(m => ({
      ...(m.todo_lists as any as TodoList),
      user_role: m.role
    }));
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
      .single<{ id: string }>();

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

  const ensureProfile = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").insert({
          id: userId,
          email: user.email,
        });
      }
    }
  };

  useEffect(() => {
    void ensureProfile();
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
    void loadLists();
    setListId(newList.id);
  }, [supabase, userId, loadLists]);

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
        void loadLists();
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
        void loadLists();
      }
    }
  }, [supabase, lists, listId, loadLists, userId]);

  const addTodo = useCallback(async () => {
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
  }, [supabase, listId, title, userId, loadTodos]);

  const toggleTodo = useCallback(async (id: string, next: boolean) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").update({ is_done: next }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      if (next) {
        // Subtle haptic confetti for task completion
        void confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.8 },
          colors: ['#6366f1', '#10b981']
        });
      }
      void loadTodos(listId);
    }
  }, [supabase, listId, loadTodos]);

  const updateTitle = useCallback(async (id: string, nextTitle: string) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").update({ title: nextTitle }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      void loadTodos(listId);
    }
  }, [supabase, listId, loadTodos]);

  const delTodo = useCallback(async (id: string) => {
    if (!listId) return;

    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Todo deleted");
      void loadTodos(listId);
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
          onListSelect={setListId}
          onCreateList={addList}
          onDeleteList={deleteList}
          onInvite={handleInvite}
          onLogout={logout}
          userId={userId}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-80 flex flex-col min-h-screen">
        <div className="mx-auto w-full max-w-3xl p-4 md:p-8 space-y-6">
          {/* Header Section */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between glass p-6 rounded-2xl shadow-xl z-10 sticky top-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="lg:hidden h-10 w-10 mr-2 bg-card border-border shadow-sm hover:text-primary transition-all">
                      <Menu className="h-5 w-5" />
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
                        setListId(id);
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
                    />
                  </SheetContent>
                </Sheet>
                <div className="p-1.5 bg-primary rounded shadow-sm">
                  <Hash className="w-4 h-4 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground truncate max-w-[200px]">
                  {currentList?.name ?? "Study Sprint"}
                </h1>
              </div>
              {currentList?.name === "Inbox" && (
                <p className="text-sm text-muted-foreground font-medium ml-1">Your quick-access brain dump for immediate tasks</p>
              )}
            </div>
          </div>

          {/* Progress Stats Bar */}
          <div className="px-4 py-2 border-b border-border/50">
            <div className="flex items-center justify-between mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Progress</span>
              <span>{completedCount}/{todos.length}</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Sprint Mode Focus Timer */}
          <FocusTimer />

          {/* Add Todo Section */}
          <div className="bg-card/50 rounded-xl overflow-hidden border border-border/50 shadow-sm transition-shadow focus-within:shadow-md">
            <div className="flex items-center gap-2 p-1 pl-3">
              <Plus className="w-4 h-4 text-primary" />
              <Input
                className="h-10 text-sm border-none bg-transparent focus-visible:ring-0 shadow-none px-0"
                placeholder="Add a task..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addTodo()}
              />
              {title.trim() && (
                <Button
                  onClick={() => void addTodo()}
                  disabled={!title.trim() || !listId || isSubmitting}
                  size="sm"
                  className="h-8 mr-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all rounded-lg"
                >
                  Add
                </Button>
              )}
            </div>
          </div>

          {/* Todo List */}
          <div className="space-y-4">
            {todos.length === 0 ? (
              <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border flex flex-col items-center">
                <motion.div
                  className="relative mb-6"
                  animate={{
                    y: [0, -15, 0],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl animate-pulse" />
                  <div className="relative p-6 bg-muted rounded-3xl">
                    <Layout className="w-12 h-12 text-muted-foreground/40" />
                  </div>
                </motion.div>
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
              <ul className="grid gap-3">
                <AnimatePresence mode="popLayout" initial={false}>
                  {todos.map((t) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20, transition: { duration: 0.2 } }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                        mass: 1
                      }}
                    >
                      <div className={`group border-b border-border/40 py-2.5 transition-colors hover:bg-muted/30 ${t.is_done ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-4">
                          <button
                            onClick={() => void toggleTodo(t.id, !t.is_done)}
                            className={`mt-1.5 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${t.is_done
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/30 hover:border-primary'
                              }`}
                          >
                            {t.is_done && <CheckCircle2 className="h-2.5 w-2.5" />}
                          </button>

                          <div className="flex-1 space-y-3">
                            <input
                              key={t.title}
                              className={`w-full bg-transparent text-sm font-medium outline-none transition-all ${t.is_done ? 'text-muted-foreground/60 line-through' : 'text-foreground hover:text-primary/90'
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
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 ml-auto transition-all rounded-md opacity-0 group-hover:opacity-100">
                                    <Trash2 className="h-3.5 w-3.5" />
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
                      </div>
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

