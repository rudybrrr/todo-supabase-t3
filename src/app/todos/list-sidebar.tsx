import React from "react";
import { Plus, Hash, Inbox, ChevronRight, MoreHorizontal, Trash2, FolderPlus, LogOut, User, LayoutDashboard, Share2, Users } from "lucide-react";
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

type TodoList = {
    id: string;
    name: string;
    owner_id: string;
};

interface ListSidebarProps {
    lists: TodoList[];
    activeListId: string | null;
    onListSelect: (id: string) => void;
    onCreateList: () => void;
    onDeleteList: (id: string) => void;
    onInvite: (id: string) => void;
    onLogout: () => void;
    userId: string;
}

export const ListSidebar = React.memo(function ListSidebar({
    lists,
    activeListId,
    onListSelect,
    onCreateList,
    onDeleteList,
    onInvite,
    onLogout,
    userId,
}: ListSidebarProps) {
    return (
        <div className="flex flex-col h-full glass border-r">
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 text-primary">
                    <Hash className="w-5 h-5 font-bold" />
                    <span className="font-bold tracking-tight text-sm uppercase">Study Sprint</span>
                </div>
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
                                    variant="ghost"
                                    className="w-full justify-start gap-3 rounded-xl font-medium transition-all hover:bg-muted"
                                >
                                    <LayoutDashboard className="h-4 w-4 text-primary" />
                                    Insights
                                </Button>
                            </Link>

                            {lists.find(l => l.name === "Inbox") && (
                                <Button
                                    variant={activeListId === lists.find(l => l.name === "Inbox")?.id ? "secondary" : "ghost"}
                                    className={`w-full justify-start gap-3 rounded-xl font-medium transition-all ${activeListId === lists.find(l => l.name === "Inbox")?.id
                                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                                        : "hover:bg-muted"
                                        }`}
                                    onClick={() => onListSelect(lists.find(l => l.name === "Inbox")!.id)}
                                >
                                    <Inbox className={`h-4 w-4 ${activeListId === lists.find(l => l.name === "Inbox")?.id ? "text-primary" : "text-primary"}`} />
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
                            {lists.filter(l => l.name !== "Inbox").map((list) => (
                                <div key={list.id} className="group flex items-center gap-1">
                                    <Button
                                        variant={activeListId === list.id ? "secondary" : "ghost"}
                                        className={`flex-1 justify-start gap-3 rounded-xl font-medium transition-all ${activeListId === list.id
                                            ? "bg-primary/10 text-primary hover:bg-primary/20 shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                                            : "hover:bg-muted"
                                            }`}
                                        onClick={() => onListSelect(list.id)}
                                    >
                                        <FolderPlus className={`h-4 w-4 ${activeListId === list.id ? "text-primary" : "text-muted-foreground/60"}`} />
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
                                </div>
                            ))}
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
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2 rounded-xl"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Logout</span>
                    </Button>
                </div>

                <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/50">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">Student Session</p>
                        <p className="text-[10px] text-muted-foreground truncate">Focusing Today</p>
                    </div>
                </div>
            </div>
        </div>
    );
});
