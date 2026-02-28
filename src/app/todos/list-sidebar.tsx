import React from "react";
import { Plus, Hash, Inbox, ChevronRight, MoreHorizontal, Trash2, FolderPlus, LogOut, User, LayoutDashboard, Share2, Users, Trophy } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { ModeToggle } from "~/components/mode-toggle";
import { motion, AnimatePresence } from "framer-motion";

import type { TodoList } from "~/lib/types";

interface ListSidebarProps {
    lists: TodoList[];
    activeListId: string | null;
    onListSelect: (id: string) => void;
    onCreateList: () => void;
    onDeleteList: (id: string) => void;
    onInvite: (id: string) => void;
    onLogout: () => void;
    userId: string;
    username?: string;
}

import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

export const ListSidebar = React.memo(function ListSidebar({
    lists,
    activeListId,
    onListSelect,
    onCreateList,
    onDeleteList,
    onInvite,
    onLogout,
    userId,
    username,
}: ListSidebarProps) {
    const pathname = usePathname();
    const inbox = React.useMemo(() => lists.find(l => l.name === "Inbox"), [lists]);

    return (
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
            <div className="p-4 flex items-center gap-3">
                <div className="p-1 rounded bg-primary text-primary-foreground">
                    <Hash className="w-4 h-4" />
                </div>
                <h1 className="font-extrabold tracking-tight text-lg text-sidebar-foreground">Study Sprint</h1>
            </div>

            <ScrollArea className="flex-1 px-3">
                <div className="space-y-4 py-4">
                    <div className="px-3 py-2">
                        <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                            Favorites
                        </h2>
                        <div className="space-y-1">
                            <Link href="/dashboard" className="block w-full">
                                <Button
                                    variant={pathname === "/dashboard" ? "secondary" : "ghost"}
                                    className={`w-full justify-start gap-3 rounded-lg font-medium transition-all ${pathname === "/dashboard"
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                                        }`}
                                >
                                    <LayoutDashboard className="h-4 w-4" />
                                    Insights
                                </Button>
                            </Link>
                            <Link href="/study-hall" className="block w-full">
                                <Button
                                    variant={pathname === "/study-hall" ? "secondary" : "ghost"}
                                    className={`w-full justify-start gap-3 rounded-lg font-medium transition-all ${pathname === "/study-hall"
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                                        }`}
                                >
                                    <Trophy className="h-4 w-4" />
                                    Study Hall
                                </Button>
                            </Link>

                            {inbox && (
                                <Button
                                    variant={activeListId === inbox.id ? "secondary" : "ghost"}
                                    className={`w-full justify-start gap-3 rounded-lg font-medium transition-all ${activeListId === inbox.id
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                                        }`}
                                    onClick={() => onListSelect(inbox.id)}
                                >
                                    <Inbox className="h-4 w-4" />
                                    Inbox
                                </Button>
                            )}
                        </div>
                    </div>

                    <Separator className="mx-4 opacity-50" />

                    <div className="px-3 py-2">
                        <div className="flex items-center justify-between mb-2 px-4">
                            <h2 className="text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                                My Projects
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 hover:bg-primary/10 hover:text-primary rounded-md"
                                onClick={onCreateList}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        <div className="space-y-1">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {lists.filter(l => l.name !== "Inbox").map((list) => (
                                    <motion.div
                                        key={list.id}
                                        layout
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="group flex items-center gap-1"
                                    >
                                        <Button
                                            variant={activeListId === list.id ? "secondary" : "ghost"}
                                            className={`flex-1 justify-start gap-3 rounded-lg font-medium transition-all ${activeListId === list.id
                                                ? "bg-primary/10 text-primary hover:bg-primary/20 ring-1 ring-primary/20"
                                                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                                                }`}
                                            onClick={() => onListSelect(list.id)}
                                        >
                                            <Hash className={`h-4 w-4 ${activeListId === list.id ? "text-primary" : "text-sidebar-foreground/40"}`} />
                                            <span className="truncate">{list.name}</span>
                                            {list.owner_id !== userId && (
                                                <Users className="h-3 w-3 ml-auto text-primary opacity-70" />
                                            )}
                                        </Button>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="rounded-xl border-border shadow-2xl">
                                                {list.owner_id === userId && (
                                                    <DropdownMenuItem
                                                        className="rounded-lg cursor-pointer flex gap-2"
                                                        onClick={() => onInvite(list.id)}
                                                    >
                                                        <Share2 className="h-4 w-4" />
                                                        Invite Member
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-lg cursor-pointer flex gap-2"
                                                    onClick={() => onDeleteList(list.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    {list.owner_id === userId ? "Delete Project" : "Leave Project"}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <div className="p-4 border-t border-border bg-card/30 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <ModeToggle />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLogout}
                        className="text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 gap-2 rounded-lg"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Logout</span>
                    </Button>
                </div>

                <Link href="/settings" className="block outline-none group">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/50 transition-all hover:bg-primary/10 hover:ring-1 hover:ring-primary/20">
                        <Avatar className="w-8 h-8 border border-border group-hover:border-primary transition-colors">
                            <AvatarFallback className="bg-primary/20 text-primary font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                {username ? username.substring(0, 1).toUpperCase() : <User className="h-4 w-4" />}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">{username ? `@${username}` : "Set Username"}</p>
                            <p className="text-[10px] text-muted-foreground truncate font-medium uppercase tracking-tight">Profile Settings</p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                </Link>
            </div>
        </div>
    );
});
