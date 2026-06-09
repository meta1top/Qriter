"use client";

import type * as React from "react";
import { Toaster as Sonner, type ToasterProps, toast } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-center"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.625rem",
        } as React.CSSProperties
      }
      toastOptions={{ style: { boxShadow: "none" } }}
      {...props}
    />
  );
}

export { Toaster, toast };
