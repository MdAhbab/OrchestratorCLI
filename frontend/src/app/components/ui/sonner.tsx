import { Toaster as Sonner, ToasterProps } from "sonner";

import { useTheme } from "../theme";

/** Sonner toaster wired to the app's own ThemeProvider so toasts follow the in-app theme toggle. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
