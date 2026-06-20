import { cn } from "@/lib/utils";

function Skeleton({
  className,
  delayed = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { delayed?: boolean }) {
  return (
    <div
      // `skeleton-delayed` (global.css): pulses, but stays INVISIBLE (space
      // reserved) for its first 200ms so a fast cache restore / SWR refetch
      // replaces it before it ever shows — no skeleton flicker on warm nav or
      // app restart (260617). Replaces Tailwind `animate-pulse`.
      //
      // `delayed={false}` → `skeleton-immediate`: pulses but VISIBLE from frame 0.
      // Pass this when the bars sit in a skeleton that already knows data is not
      // sub-200ms (loading.tsx / post-restore cold tabs) so the cards don't show
      // empty for 200ms before the bars appear (260620).
      className={cn(
        delayed ? "skeleton-delayed" : "skeleton-immediate",
        "rounded-md bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
