"use client";

import { Folder, Plus, Tag } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { QuickAddActiveSuggestionState, QuickAddMatchedToken, QuickAddSuggestion } from "~/lib/quick-add-parser";
import { cn } from "~/lib/utils";

function getTokenHighlightClass(kind: QuickAddMatchedToken["kind"]) {
    if (kind === "project") {
        return "rounded-sm border border-border/60 bg-accent/10 text-foreground";
    }

    if (kind === "date") {
        return "rounded-sm border border-border/60 bg-secondary/70 text-foreground";
    }

    if (kind === "time") {
        return "rounded-sm border border-border/60 bg-secondary/60 text-foreground";
    }

    if (kind === "priority") {
        return "rounded-sm border border-destructive/20 bg-destructive/8 text-destructive";
    }

    if (kind === "reminder") {
        return "rounded-sm border border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200";
    }

    if (kind === "recurrence") {
        return "rounded-sm border border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200";
    }

    if (kind === "label") {
        return "rounded-sm border border-primary/20 bg-primary/10 text-primary";
    }

    return "rounded-sm border border-border/60 bg-muted/70 text-foreground";
}

function renderHighlightedComposerText(input: string, tokens: QuickAddMatchedToken[], placeholder: string) {
    if (!input) {
        return <span className="text-muted-foreground/75">{placeholder}</span>;
    }

    const children: ReactNode[] = [];
    let cursor = 0;

    tokens.forEach((token, index) => {
        if (token.start > cursor) {
            children.push(
                <span key={`text-${index}-${cursor}`}>
                    {input.slice(cursor, token.start)}
                </span>,
            );
        }

        children.push(
            <span key={`token-${token.kind}-${token.start}-${token.end}`} className={getTokenHighlightClass(token.kind)}>
                {input.slice(token.start, token.end)}
            </span>,
        );

        cursor = token.end;
    });

    if (cursor < input.length) {
        children.push(<span key={`tail-${cursor}`}>{input.slice(cursor)}</span>);
    }

    if (input.endsWith("\n")) {
        children.push(<span key="trailing-newline">{"\n"}</span>);
    }

    return children;
}

function getSuggestionIcon(suggestion: QuickAddSuggestion) {
    if (!suggestion.isExisting) {
        return <Plus className="h-4 w-4 shrink-0 text-foreground" />;
    }

    if (suggestion.kind === "project") {
        return <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }

    return <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function TaskSyntaxComposer({
    ariaLabel,
    className,
    composerClassName,
    highlightClassName,
    inputClassName,
    onApplySuggestion,
    onChange,
    onSelectionChange,
    onSubmit,
    placeholder,
    rows = 1,
    selectionPosition = null,
    suggestionState,
    tokens,
    value,
}: {
    ariaLabel: string;
    className?: string;
    composerClassName?: string;
    highlightClassName?: string;
    inputClassName?: string;
    onApplySuggestion?: (suggestion: QuickAddSuggestion) => void;
    onChange: (value: string) => void;
    onSelectionChange?: (selection: number) => void;
    onSubmit?: () => void;
    placeholder: string;
    rows?: number;
    selectionPosition?: number | null;
    suggestionState?: QuickAddActiveSuggestionState | null;
    tokens: QuickAddMatchedToken[];
    value: string;
}) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const inputHighlightRef = useRef<HTMLDivElement>(null);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const suggestions = suggestionState?.suggestions ?? [];
    const activeSuggestion = suggestions[activeSuggestionIndex] ?? suggestions[0] ?? null;
    const hasSuggestions = suggestions.length > 0;

    useEffect(() => {
        setActiveSuggestionIndex(0);
    }, [suggestionState?.end, suggestionState?.kind, suggestionState?.query, suggestionState?.start, suggestions.length]);

    useLayoutEffect(() => {
        if (selectionPosition == null) return;
        if (!inputRef.current) return;

        inputRef.current.focus();
        inputRef.current.setSelectionRange(selectionPosition, selectionPosition);
        onSelectionChange?.(selectionPosition);
    }, [onSelectionChange, selectionPosition, value]);

    const highlightedText = useMemo(
        () => renderHighlightedComposerText(value, tokens, placeholder),
        [placeholder, tokens, value],
    );

    function syncSelection(selection: number | null | undefined) {
        if (typeof selection !== "number") return;
        onSelectionChange?.(selection);
    }

    function syncScroll(target: HTMLTextAreaElement) {
        if (!inputHighlightRef.current) return;

        inputHighlightRef.current.style.transform = `translate(${-target.scrollLeft}px, ${-target.scrollTop}px)`;
    }

    function handleSuggestionSelect(suggestion: QuickAddSuggestion | null) {
        if (!suggestion) return;
        onApplySuggestion?.(suggestion);
    }

    return (
        <div className={cn("relative", className)}>
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute inset-0 overflow-hidden text-[1rem] leading-7",
                    highlightClassName,
                )}
            >
                <div
                    ref={inputHighlightRef}
                    className={cn("min-h-[44px] whitespace-pre-wrap break-words text-foreground [word-break:break-word]", composerClassName)}
                >
                    {highlightedText}
                </div>
            </div>

            <textarea
                ref={inputRef}
                rows={rows}
                aria-label={ariaLabel}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    syncSelection(event.target.selectionStart);
                }}
                onClick={(event) => syncSelection(event.currentTarget.selectionStart)}
                onKeyUp={(event) => syncSelection(event.currentTarget.selectionStart)}
                onSelect={(event) => syncSelection(event.currentTarget.selectionStart)}
                onScroll={(event) => syncScroll(event.currentTarget)}
                onKeyDown={(event) => {
                    if (hasSuggestions) {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
                            return;
                        }

                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
                            return;
                        }

                        if (event.key === "Enter" || event.key === "Tab") {
                            event.preventDefault();
                            handleSuggestionSelect(activeSuggestion);
                            return;
                        }
                    }

                    if (event.key === "Enter" && !event.shiftKey && onSubmit) {
                        event.preventDefault();
                        onSubmit();
                    }
                }}
                className={cn(
                    "relative min-h-[44px] w-full resize-none border-0 bg-transparent p-0 text-[1rem] leading-7 text-transparent caret-foreground outline-none focus-visible:ring-0",
                    composerClassName,
                    inputClassName,
                )}
            />

            {hasSuggestions ? (
                <div className="absolute inset-x-0 top-full z-30 mt-2.5 overflow-hidden rounded-lg border border-border/70 bg-popover/98 shadow-[0_14px_28px_rgba(17,18,15,0.12)]">
                    <div className="border-b border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {suggestionState?.kind === "project" ? "Projects" : "Labels"}
                    </div>
                    <div className="max-h-72 overflow-y-auto p-1.5">
                        {suggestions.map((suggestion, index) => {
                            const active = index === activeSuggestionIndex;

                            return (
                                <button
                                    key={suggestion.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleSuggestionSelect(suggestion)}
                                    className={cn(
                                        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
                                        active ? "bg-secondary/80 text-foreground" : "text-foreground hover:bg-secondary/60",
                                    )}
                                >
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80">
                                        {getSuggestionIcon(suggestion)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-foreground">{suggestion.label}</div>
                                        <div className="truncate text-xs text-muted-foreground">{suggestion.description}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
