import React from "react";
import { Plus, Hash, Inbox, ChevronRight, MoreHorizontal, Trash2, FolderPlus, LogOut, User, LayoutDashboard, Trophy, Share2, Users, List, Star, CheckSquare, GripVertical } from "lucide-react";
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
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

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

    const [isMounted, setIsMounted] = React.useState(false);
    const [localLists, setLocalLists] = React.useState<TodoList[]>([]);

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    React.useEffect(() => {
        const inboxFiltered = lists.filter(l => l.name !== "Inbox");
        const savedOrder = localStorage.getItem(`list-order-${userId}`);
        let sorted = [...inboxFiltered];
        if (savedOrder) {
            try {
                const orderArr = JSON.parse(savedOrder) as string[];
                sorted.sort((a, b) => {
                    const indexA = orderArr.indexOf(a.id);
                    const indexB = orderArr.indexOf(b.id);
                    if (indexA === -1 && indexB === -1) return 0;
                    if (indexA === -1) return 1;
                    if (indexB === -1) return -1;
                    return indexA - indexB;
                });
            } catch (e) {
                console.error("Failed to parse list order", e);
            }
        }
        setLocalLists(sorted);
    }, [lists, userId]);

    const onDragEnd = (result: any) => {
        if (!result.destination) return;
        const items = Array.from(localLists);
        const [reorderedItem] = items.splice(result.source.index, 1);
        if (reorderedItem) {
            items.splice(result.destination.index, 0, reorderedItem);
        }
        setLocalLists(items);
        localStorage.setItem(`list-order-${userId}`, JSON.stringify(items.map(i => i.id)));
    };

    return (
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
            {/* Header */}
            <div className="p-6 pb-2">
                <h1 className="font-bold tracking-tight text-lg text-sidebar-foreground">Study Sprint</h1>
            </div>

            <div className="flex-1 px-3 overflow-y-auto overflow-x-hidden">
                <div className="space-y-6 py-4">
                    {/* Dashboard Area */}
                    <div className="space-y-0.5 px-2">
                        <Link href="/dashboard" className="block w-full">
                            <Button
                                variant="ghost"
                                className={`w-full justify-start gap-3 rounded-lg font-medium transition-all ${pathname === "/dashboard"
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                                    }`}
                            >
                                <LayoutDashboard className="h-[18px] w-[18px] text-amber-500" />
                                Insights
                            </Button>
                        </Link>
                    </div>

                    {/* Study Hall Section */}
                    <div className="px-2">
                        <h2 className="text-[11px] font-bold tracking-widest text-sidebar-foreground/40 mb-2 px-2 uppercase">
                            Network
                        </h2>
                        <Link href="/study-hall" className="block w-full">
                            <Button
                                variant="ghost"
                                className={`w-full justify-start gap-3 rounded-lg font-medium transition-all ${pathname === "/study-hall"
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                                    }`}
                            >
                                <Trophy className="h-[18px] w-[18px] text-emerald-500" />
                                Study Hall
                            </Button>
                        </Link>
                    </div>

                    {/* Lists Section */}
                    <div className="px-2">
                        <div className="flex items-center justify-between mb-2 px-2 group/header">
                            <h2 className="text-[11px] font-bold tracking-widest text-sidebar-foreground/40 uppercase">
                                My Projects
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover/header:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-md transition-opacity"
                                onClick={onCreateList}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        <div className="space-y-0.5">
                            {inbox && (
                                <Button
                                    variant="ghost"
                                    className={`w-full justify-start gap-3 rounded-lg font-medium transition-all mb-2 ${activeListId === inbox.id
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                        : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                                        }`}
                                    onClick={() => onListSelect(inbox.id)}
                                >
                                    <Inbox className="h-[18px] w-[18px] text-blue-500" />
                                    Inbox
                                </Button>
                            )}

                            {isMounted ? (
                                <DragDropContext onDragEnd={onDragEnd}>
                                    <Droppable droppableId="projects-list">
                                        {(provided) => (
                                            <div
                                                {...provided.droppableProps}
                                                ref={provided.innerRef}
                                                className="space-y-0.5"
                                            >
                                                {localLists.map((list, index) => (
                                                    <Draggable key={list.id} draggableId={list.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={{
                                                                    ...provided.draggableProps.style,
                                                                    ...(snapshot.isDragging ? { zIndex: 50 } : {})
                                                                }}
                                                                className={`group flex items-center gap-1 ${snapshot.isDragging ? 'opacity-90 scale-[1.02] shadow-sm rounded-lg bg-sidebar-accent' : ''}`}
                                                            >
                                                                <div
                                                                    onClick={() => onListSelect(list.id)}
                                                                    className={`flex-1 flex items-center gap-3 rounded-lg font-medium px-3 py-2 cursor-pointer transition-all ${activeListId === list.id
                                                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                                                        : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                                                                        }`}
                                                                >
                                                                    <List className={`h-[15px] w-[15px] ${activeListId === list.id ? "text-sidebar-foreground" : "text-sidebar-foreground/40"}`} />
                                                                    <span className="truncate">{list.name}</span>
                                                                    {list.owner_id !== userId && (
                                                                        <Users className="h-3 w-3 ml-auto text-sidebar-foreground/40" />
                                                                    )}
                                                                </div>

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
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                            ) : (
                                <div className="space-y-0.5">
                                    {localLists.map((list) => (
                                        <div key={list.id} className="group flex items-center gap-1 opacity-50">
                                            <Button
                                                variant="ghost"
                                                className={`flex-1 justify-start gap-3 rounded-lg font-medium transition-all ${activeListId === list.id
                                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                                    : "text-sidebar-foreground/80"
                                                    }`}
                                            >
                                                <List className={`h-[15px] w-[15px] text-sidebar-foreground/40`} />
                                                <span className="truncate">{list.name}</span>
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 mt-auto">
                <div className="flex items-center justify-between px-2 mb-2">
                    <ModeToggle />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLogout}
                        className="text-sidebar-foreground/40 hover:text-sidebar-foreground gap-2 rounded-lg"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="text-xs font-semibold">Logout</span>
                    </Button>
                </div>

                <Link href="/settings" className="block outline-none group">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-sidebar-accent">
                        <Avatar className="w-8 h-8 group-hover:opacity-90 transition-opacity">
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                {username ? username.substring(0, 1).toUpperCase() : <User className="h-4 w-4" />}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-sidebar-foreground">{username ? `${username}` : "Set Username"}</p>
                            <p className="text-[11px] text-sidebar-foreground/50 truncate font-medium">Settings</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
});
