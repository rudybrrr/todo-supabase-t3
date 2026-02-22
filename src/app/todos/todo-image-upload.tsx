"use client";

import { useState, useMemo } from "react";
import { Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

const BUCKET = "todo-images";

interface TodoImageUploadProps {
    userId: string;
    todoId: string;
    listId: string | null;
    onUploaded: () => Promise<void> | void;
}

export function TodoImageUpload({
    userId,
    todoId,
    listId,
    onUploaded,
}: TodoImageUploadProps) {
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
