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
  // The toast uses the ELEVATED surface token so it reads as a soft GREY pill that
  // flips with the theme (dark-grey on the dark UI, light-grey on the light UI) —
  // the previous inverted palette rendered a near-black toast in light mode, which
  // looked heavy. Tokens keep it on-brand + theme-correct.
  return (
    <SonnerToaster
      theme={appTheme}
      className="toaster group"
      // Sonner reads these CSS vars for the toast surface — point them at the
      // elevated tokens so the toast is a soft GREY that flips with the theme
      // (grey on light, dark-grey on dark). Setting the vars beats sonner's own
      // CSS, which a Tailwind bg utility does not.
      style={
        {
          "--normal-bg": "var(--surface-elevated-dark)",
          "--normal-text": "var(--body-on-dark)",
          "--normal-border": "var(--hairline-on-dark)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          description: "group-[.toast]:text-[var(--muted-foreground)]",
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
