import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal Slot: merges props/className onto the single child element. */
export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(({ children, className, ...props }, ref) => {
  if (!React.isValidElement(children)) return null;
  const child = children as React.ReactElement<{ className?: string }>;
  return React.cloneElement(child, { ...props, ref, className: cn(className, child.props.className) } as never);
});
Slot.displayName = "Slot";
