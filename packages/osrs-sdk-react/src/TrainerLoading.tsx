import React, { HTMLAttributes } from "react";
import { TrainerLoadingState } from "osrs-sdk";
import { ProgressBar, ProgressBarProps } from "./components";

export type TrainerLoadingProps = HTMLAttributes<HTMLDivElement> & {
  state?: TrainerLoadingState;
  progressBar?: Omit<ProgressBarProps, "progress">;
};

export function TrainerLoading({ progressBar, state, style, ...props }: TrainerLoadingProps) {
  if (state?.status === "ready") return null;
  const text = state?.status === "error"
    ? `Loading failed: ${state.error?.message ?? "Unknown error"}`
    : `Loading: ${Math.floor((state?.assetProgress ?? 0) * 100)}%`;
  return (
    <div
      id="trainer-loading"
      {...props}
      style={{
        fontSize: "16pt",
        width: "33%",
        ...style,
      }}
    >
      <div>{text}</div>
      {state?.status !== "error" && (
        <ProgressBar
          backgroundColor="#282828"
          borderColor="#FFFF00"
          fillColor="#FFFF00"
          progress={state?.assetProgress ?? 0}
          {...progressBar}
          style={{ marginTop: "0.25rem", ...progressBar?.style }}
        />
      )}
    </div>
  );
}
