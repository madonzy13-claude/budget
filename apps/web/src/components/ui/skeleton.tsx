import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // `skeleton-delayed` (global.css): pulses, but stays INVISIBLE (space
      // reserved) for its first 200ms so a fast cache restore / SWR refetch
      // replaces it before it ever shows — no skeleton flicker on warm nav or
      // app restart (260617). Replaces Tailwind `animate-pulse`.
      className={cn("skeleton-delayed rounded-md bg-primary/10", className)}
      {...props}
    />
  );
}

export { Skeleton };
