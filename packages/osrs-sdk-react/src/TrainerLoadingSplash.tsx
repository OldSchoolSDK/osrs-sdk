import React, { HTMLAttributes } from "react";
import { TrainerLoadingState } from "osrs-sdk";
import { ProgressBar, ProgressBarProps } from "./components";

export type TrainerLoadingSplashProps = HTMLAttributes<HTMLDivElement> & {
  state?: TrainerLoadingState;
  progressBar?: Omit<ProgressBarProps, "progress">;
};

export function TrainerLoadingSplash({ progressBar, state, style, ...props }: TrainerLoadingSplashProps) {
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
        position: "absolute",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
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
          style={{ marginTop: "0.25rem", width: '50%', ...progressBar?.style }}
        />
      )}
    </div>
  );
}
