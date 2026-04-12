"use client";

import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import type { ProjectMemberProfile } from "~/lib/types";

export function TaskDetailAssignee({
  value,
  members,
  onChange,
}: {
  value: string;
  members: ProjectMemberProfile[];
  onChange: (value: string) => void;
}) {
  const selectedMember = members.find((member) => member.user_id === value);

  return (
    <Select
      value={value || "none"}
      onValueChange={(nextValue) =>
        onChange(nextValue === "none" ? "" : nextValue)
      }
    >
      <SelectTrigger
        id="detailAssignee"
        className="border-border/60 bg-background/80 h-auto min-h-0 rounded-xl px-3 py-2.5 shadow-none focus-visible:ring-0"
      >
        <span className="inline-flex w-full items-center gap-2">
          {selectedMember ? (
            <>
              <Avatar className="border-border/70 h-5 w-5 border">
                <AvatarImage
                  src={selectedMember.avatar_url ?? ""}
                  alt={selectedMember.username ?? "Assignee"}
                />
                <AvatarFallback className="text-[9px]">
                  {(selectedMember.full_name ?? selectedMember.username ?? "A")
                    .slice(0, 1)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>
                {selectedMember.full_name ??
                  `@${selectedMember.username ?? "unknown"}`}
              </span>
            </>
          ) : (
            <>
              <UserRound className="text-muted-foreground h-4 w-4 shrink-0" />
              <span>Unassigned</span>
            </>
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.user_id} value={member.user_id}>
            {member.full_name ?? `@${member.username ?? "unknown"}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
