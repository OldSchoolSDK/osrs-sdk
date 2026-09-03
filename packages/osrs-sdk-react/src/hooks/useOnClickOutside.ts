import { useEffect } from "react";
import type { RefObject } from "react";

export function useOnClickOutside<T extends Node>(
  ref: RefObject<T>,
  onOutsideClick: (event: PointerEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onOutsideClick(event);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [enabled, onOutsideClick, ref]);
}
