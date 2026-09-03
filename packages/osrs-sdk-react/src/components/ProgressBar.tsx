import React, { HTMLAttributes } from "react";

export type ProgressBarProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Progress as a fraction between 0 and 1. Values outside that range are clamped. */
  progress: number;
  borderColor: string;
  backgroundColor: string;
  fillColor: string;
};

export function ProgressBar({
  backgroundColor,
  borderColor,
  fillColor,
  progress,
  style,
  ...props
}: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * 100;

  return (
    <div
      {...props}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      style={{
        backgroundColor,
        border: `1px solid ${borderColor}`,
        boxSizing: "border-box",
        height: "1rem",
        overflow: "hidden",
        width: "100%",
        ...style,
      }}
    >
      <div
        style={{
          backgroundColor: fillColor,
          height: "100%",
          width: `${percentage}%`,
        }}
      />
    </div>
  );
}
