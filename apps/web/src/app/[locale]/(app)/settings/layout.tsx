/**
 * Settings layout — pass-through for the catch-all `[[...tab]]/page.tsx`.
 *
 * The no-layout-shift fallback for the server session read lives in the sibling
 * `loading.tsx` (App Router only commits a soft nav instantly when a `loading.tsx`
 * exists for the segment — a manual <Suspense> here would not). This layout keeps
 * no Suspense of its own to avoid a redundant second boundary; the pill bar +
 * carousel live in the single client <UserSettingsShell> tree.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
