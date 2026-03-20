import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-muted text-muted-foreground",
        secondary: "border-border/70 bg-secondary text-secondary-foreground",
        outline: "border-border/70 bg-transparent text-muted-foreground",
        success: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        warning: "border-amber-500/20 bg-amber-500/14 text-amber-700 dark:text-amber-300",
        danger: "border-rose-500/20 bg-rose-500/14 text-rose-700 dark:text-rose-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
