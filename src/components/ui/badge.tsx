import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-[0.08em]",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/80 text-muted-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        success:
          "border-emerald-700/15 bg-emerald-700/8 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100",
        warning:
          "border-amber-700/15 bg-amber-700/8 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100",
        danger:
          "border-rose-700/15 bg-rose-700/8 text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100",
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
