"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border border-white/20 outline-none transition-colors",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:ring-3 focus-visible:ring-[#ecf15e]/35",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-3.5 w-6" : "h-[1.15rem] w-8",
        "data-[state=unchecked]:bg-white/15",
        "data-[state=checked]:border-transparent data-[state=checked]:bg-[#ecf15e]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full shadow-sm ring-0 transition-transform",
          size === "sm" ? "size-3" : "size-4",
          "data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-white",
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-[#0e0f11]"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
