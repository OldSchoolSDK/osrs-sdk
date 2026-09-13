import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTrainerContext } from "../TrainerContext";
import { useTrainerSnapshot } from "../hooks/useTrainerSnapshot";
import { GameOverlay } from "./GameOverlay";
import { Modal } from "./Modal";
import { RuneScapeButton } from "./RuneScapeButton";
import { RuneScapePanel } from "./RuneScapePanel";

export function PauseController() {
  const trainer = useTrainerContext();
  const paused = useTrainerSnapshot((snapshot) => snapshot.world.isPaused);
  const pausedForBackground = useRef(false);
  const [resumeRequired, setResumeRequired] = useState(false);

  const pauseForBackground = useCallback(() => {
    if (trainer.getSnapshot().world.isPaused) return;
    pausedForBackground.current = true;
    trainer.stop();
  }, [trainer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pauseForBackground();
      } else if (pausedForBackground.current) {
        setResumeRequired(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pauseForBackground]);

  // Covers auto-start completing while the trainer was already backgrounded.
  useEffect(() => {
    if (!paused && document.visibilityState === "hidden") pauseForBackground();
  }, [pauseForBackground, paused]);

  const resume = () => {
    pausedForBackground.current = false;
    setResumeRequired(false);
    trainer.start();
  };

  return (
    <GameOverlay>
      <Modal open={resumeRequired}>
        <RuneScapePanel style={{ maxWidth: 360, textAlign: "center" }}>
          <p style={{ margin: "0 0 16px" }}>Paused</p>
          <RuneScapeButton autoFocus onClick={resume} type="button">Resume</RuneScapeButton>
        </RuneScapePanel>
      </Modal>
    </GameOverlay>
  );
}
