/**
 * Avatar initials — first letters of the first two words, else the first two
 * characters, and "?" when there's nothing to show. Shared by the header profile
 * menu and the members list so both avatars fall back identically (bug #2).
 */
export function initialsOf(
  name?: string | null,
  email?: string | null,
): string {
  const source = (name || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
