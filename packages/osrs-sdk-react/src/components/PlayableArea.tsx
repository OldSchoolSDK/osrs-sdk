import React, { forwardRef, HTMLAttributes } from "react";

export type PlayableAreaProps = HTMLAttributes<HTMLDivElement>;

export const PlayableArea = forwardRef<HTMLDivElement, PlayableAreaProps>(
  ({ children, style, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      style={{
        flex: "1 1 0",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  ),
);

PlayableArea.displayName = "PlayableArea";
