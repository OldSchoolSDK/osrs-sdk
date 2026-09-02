import React, { CanvasHTMLAttributes, HTMLAttributes, useCallback, useEffect, useRef } from "react";
import { TrainerInstance, TrainerLoadingState } from "osrs-sdk";
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
  const loadingListener = useRef(onLoadingStateChange);
  loadingListener.current = onLoadingStateChange;

  const mountCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || activeTrainer.current === trainer) return;
    activeTrainer.current = trainer;
    trainer.mount(canvas);
    void trainer.load({
      onStateChange: (state) => {
        if (activeTrainer.current === trainer) loadingListener.current?.(state);
      },
    }).then(() => {
      if (autoStart && activeTrainer.current === trainer) trainer.start();
    }).catch(() => undefined);
  }, [autoStart, trainer]);

  useEffect(() => () => {
    if (activeTrainer.current === trainer) activeTrainer.current = null;
    trainer.dispose();
  }, [trainer]);

  return (
    <TrainerProvider trainer={trainer}>
      <div
        {...props}
        style={{ inset: 0, overflow: "hidden", position: "fixed", ...style }}
      >
        <canvas
          id="world"
          {...canvasProps}
          ref={mountCanvas}
          onContextMenu={canvasProps?.onContextMenu ?? ((event) => event.preventDefault())}
          style={{ imageRendering: "pixelated", inset: 0, position: "absolute", ...canvasProps?.style }}
        />
        {children}
      </div>
    </TrainerProvider>
  );
}
