import * as React from "react";

import { cn } from "../../lib/utils";
import { Input as UiInput } from "../ui/input";

type InputProps = React.ComponentProps<typeof UiInput>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <UiInput
        ref={ref}
        className={cn(
          "h-10 rounded-lg border-input bg-card text-[14px] shadow-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 focus-visible:ring-offset-0 aria-invalid:border-destructive aria-invalid:bg-destructive/5 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "AppleInput";

export { Input };
