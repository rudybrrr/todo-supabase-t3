"use client";

import { useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";

import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { uploadTaskAttachments } from "~/lib/task-actions";
import { MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENT_SIZE_MB } from "~/lib/task-attachments";

interface TaskAttachmentUploadProps {
    userId: string;
    todoId: string;
    listId: string | null;
    currentTotalSizeBytes: number;
    onUploaded: () => Promise<void> | void;
}

export function TaskAttachmentUpload({
    userId,
    todoId,
    listId,
    currentTotalSizeBytes,
    onUploaded,
}: TaskAttachmentUploadProps) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

    async function handleFiles(files: File[]) {
        if (!listId || files.length === 0) return;

        setUploading(true);
        try {
            await uploadTaskAttachments(supabase, userId, todoId, listId, files, (name, progress) => {
                setUploadProgress(prev => ({ ...prev, [name]: progress }));
            });
            await onUploaded();
            toast.success(files.length === 1 ? "File uploaded." : `${files.length} files uploaded.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to upload files.");
        } finally {
            setUploading(false);
            setUploadProgress({});
        }
    }

    return (
        <div className="flex items-center gap-2 overflow-hidden">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${uploading
                ? "bg-muted text-muted-foreground/50"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}>
                {uploading ? (
                    <>
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                        Uploading...
                    </>
                ) : (
                    <>
                        <Paperclip className="h-3.5 w-3.5" />
                        <div className="flex flex-col items-start leading-tight">
                            <span>Attach files</span>
                        </div>
                    </>
                )}
                <input
                    type="file"
                    className="hidden"
                    multiple
                    disabled={uploading || !listId}
                    onChange={(event) => {
                        const files = Array.from(event.currentTarget.files ?? []);
                        const newTotal = files.reduce((acc, f) => acc + f.size, 0);

                        if (currentTotalSizeBytes + newTotal > MAX_ATTACHMENT_SIZE_BYTES) {
                            toast.error(`Total attachment size cannot exceed ${MAX_ATTACHMENT_SIZE_MB}MB.`);
                            event.currentTarget.value = "";
                            return;
                        }

                        if (files.length > 0) {
                            void handleFiles(files);
                        }
                        event.currentTarget.value = "";
                    }}
                />
            </label>

            {Object.keys(uploadProgress).length > 0 && (
                <div className="absolute right-0 top-full z-10 mt-1 flex w-48 flex-col gap-1 rounded-md border border-border/60 bg-card p-2 shadow-lg">
                    {Object.entries(uploadProgress).map(([name, progress]) => (
                        <div key={name} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2 overflow-hidden text-[10px]">
                                <span className="truncate text-muted-foreground">{name}</span>
                                <span className="shrink-0 font-medium">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                <div 
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
