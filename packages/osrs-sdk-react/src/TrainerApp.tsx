import React, { CanvasHTMLAttributes, HTMLAttributes, useLayoutEffect, useRef } from "react";
import { TrainerInstance, TrainerLoadingState } from "osrs-sdk";
import { PlayableArea } from "./components";
import { TrainerProvider } from "./TrainerContext";

export type TrainerAppProps = HTMLAttributes<HTMLDivElement> & {
  autoStart?: boolean;
  canvasProps?: CanvasHTMLAttributes<HTMLCanvasElement>;
  onLoadingStateChange?: (state: TrainerLoadingState) => void;
  trainer: TrainerInstance;
};

export function TrainerApp({
  autoStart = true,
  canvasProps,
  children,
  onLoadingStateChange,
  style,
  trainer,
  ...props
}: TrainerAppProps) {
  const activeTrainer = useRef<TrainerInstance | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playableAreaRef = useRef<HTMLDivElement | null>(null);
  const loadingListener = useRef(onLoadingStateChange);
  loadingListener.current = onLoadingStateChange;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTrainer.current === trainer) return;
    activeTrainer.current = trainer;
    trainer.mount(canvas, playableAreaRef.current!);
    void trainer.load({
      onStateChange: (state) => {
        if (activeTrainer.current === trainer) loadingListener.current?.(state);
      },
    }).then(() => {
      if (autoStart && activeTrainer.current === trainer) trainer.start();
    }).catch(() => undefined);

    return () => {
      if (activeTrainer.current === trainer) activeTrainer.current = null;
      trainer.dispose();
    };
  }, [autoStart, trainer]);

  return (
    <TrainerProvider trainer={trainer}>
      <div
        {...props}
        style={{ display: "flex", inset: 0, overflow: "hidden", position: "fixed", ...style }}
      >
        <PlayableArea ref={playableAreaRef}>
          <canvas
            id="world"
            {...canvasProps}
            ref={canvasRef}
            onContextMenu={canvasProps?.onContextMenu ?? ((event) => event.preventDefault())}
            style={{
              height: "100%",
              imageRendering: "pixelated",
              inset: 0,
              position: "absolute",
              width: "100%",
              ...canvasProps?.style,
            }}
          />
        </PlayableArea>
        {children}
      </div>
    </TrainerProvider>
  );
}
