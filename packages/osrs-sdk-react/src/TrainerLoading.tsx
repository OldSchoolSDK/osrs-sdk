import React, { HTMLAttributes } from "react";
import { TrainerLoadingState } from "osrs-sdk";

export type TrainerLoadingProps = HTMLAttributes<HTMLDivElement> & {
  state?: TrainerLoadingState;
};

export function TrainerLoading({ state, ...props }: TrainerLoadingProps) {
  if (state?.status === "ready") return null;
  const text = state?.status === "error"
    ? `Loading failed: ${state.error?.message ?? "Unknown error"}`
    : `Loading: ${Math.floor((state?.assetProgress ?? 0) * 100)}%`;
  return <div {...props}>{text}</div>;
}
