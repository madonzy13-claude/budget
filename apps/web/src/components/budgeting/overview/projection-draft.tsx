"use client";
/**
 * projection-draft.tsx — the horizon a thumb is currently ON, shared across the
 * Overview.
 *
 * The strip owns the slider, but the figures beside it — free-to-move and the
 * deficit — live on the cards ABOVE it, and they have to move with the thumb
 * rather than wait for it to be let go (user, 260904k). The committed pick
 * already travels between them through the member ui-prefs cache; this carries
 * the transient one, which must never be persisted.
 *
 * Two contexts on purpose: the strip only ever WRITES and the cards only ever
 * READ, so the writer does not re-render every time the value it just set comes
 * back round.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const DraftValue = createContext<number | null>(null);
const DraftSetter = createContext<(days: number | null) => void>(() => {});

export function ProjectionDraftProvider({
  children,
  initialDraft = null,
}: {
  children: ReactNode;
  /** Test seam: the real provider always starts with no thumb down. */
  initialDraft?: number | null;
}) {
  const [draft, setDraft] = useState<number | null>(initialDraft);
  // The setter is stable, so a component that only writes never re-renders for
  // its own write.
  const value = useMemo(() => draft, [draft]);
  return (
    <DraftSetter.Provider value={setDraft}>
      <DraftValue.Provider value={value}>{children}</DraftValue.Provider>
    </DraftSetter.Provider>
  );
}

/** The window under the thumb right now, or null when nothing is being dragged. */
export function useProjectionDraft(): number | null {
  return useContext(DraftValue);
}

export function useSetProjectionDraft(): (days: number | null) => void {
  return useContext(DraftSetter);
}
