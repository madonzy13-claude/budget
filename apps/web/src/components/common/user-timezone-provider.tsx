"use client";
/**
 * user-timezone-provider.tsx — makes the signed-in user's IANA timezone available
 * to client components so every "current month" / today-relative range rolls over
 * in the user's local calendar, not UTC (r31 item 1). Seeded SSR-side from the
 * session (so the server and client render the SAME month → no hydration mismatch),
 * and updated live when the user changes it in Settings (the General section
 * dispatches `budget:timezone-changed`, same event the sessions list listens to).
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const UserTimezoneContext = createContext<string>("UTC");

export function UserTimezoneProvider({
  tz,
  children,
}: {
  tz: string;
  children: ReactNode;
}) {
  const [zone, setZone] = useState(tz);
  // The server-seeded prop is authoritative across navigations.
  useEffect(() => {
    setZone(tz);
  }, [tz]);
  // Live-follow a Settings timezone change without a reload.
  useEffect(() => {
    function onTz(e: Event) {
      const next = (e as CustomEvent<string>).detail;
      if (next) setZone(next);
    }
    window.addEventListener("budget:timezone-changed", onTz);
    return () => window.removeEventListener("budget:timezone-changed", onTz);
  }, []);
  return (
    <UserTimezoneContext.Provider value={zone}>
      {children}
    </UserTimezoneContext.Provider>
  );
}

/** The user's IANA timezone (defaults "UTC" outside the provider). */
export function useUserTimezone(): string {
  return useContext(UserTimezoneContext);
}
