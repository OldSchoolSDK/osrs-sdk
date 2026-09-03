import { Settings } from "./Settings";

export class Chrome {
  static size() {
    // TODO: this is a 'legacy' hook for UI elements to read the canvas size. Should be removed
    // and they should be reading the size from Viewport instead.
    const canvas = document.getElementById("world");
    const bounds = canvas?.getBoundingClientRect();
    const width = bounds?.width || window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    const height = bounds?.height || window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    return { width, height };
  }
}
