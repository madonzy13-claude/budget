"use client";

import { useEffect, useState } from "react";
import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/** Live app theme from <html data-theme> (dark-first). */
function useHtmlTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.getAttribute("data-theme") === "light"
          ? "light"
          : "dark",
      );
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const appTheme = useHtmlTheme();
  // INVERTED: a LIGHT toast on the dark UI (dark on light) — high contrast so the
  // notification is clearly visible, instead of a dark pill that blends into the
  // dark page. Sonner's own theme palette renders it; we don't override bg/text.
  const toastTheme = appTheme === "dark" ? "light" : "dark";
  return (
    <SonnerToaster
      theme={toastTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
