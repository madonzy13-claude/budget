import { NavLink } from "./nav-link";

interface BrandMarkProps {
  href: string;
  size?: "sm" | "md";
}

/**
 * Brand wordmark. Yellow uppercase "BUDGET" — single accent voltage,
 * never shaded or gradient-filled. Used in top nav and auth-page header.
 */
export function BrandMark({ href, size = "md" }: BrandMarkProps) {
  const sizeCls = size === "sm" ? "text-[15px]" : "text-[17px]";
  return (
    <NavLink
      href={href}
      className={`inline-flex items-center font-bold uppercase tracking-[0.04em] text-[var(--primary)] ${sizeCls}`}
    >
      Budget
    </NavLink>
  );
}
