/* eslint-disable @typescript-eslint/no-empty-function */

import { Random } from "../src/sdk/Random";
import { Settings } from "../src/sdk/Settings";

// Mock Vector3 class for position/rotation/scale
class MockVector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: any) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
}

// Mock canvas context
const mockCanvasContext = {
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: [] }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {},
  getExtension: () => null,
  getParameter: () => "mock",
};

// Polyfill for OffscreenCanvas
if (typeof OffscreenCanvas === 'undefined') {
  (global as any).OffscreenCanvas = class OffscreenCanvas {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    getContext(contextId: string, options?: any) {
      return mockCanvasContext;
    }

    convertToBlob() {
      return Promise.resolve(new Blob());
    }

    transferToImageBitmap() {
      return null;
    }
  };
}

const nextRandom = [];
jest.mock("../src/sdk/ControlPanelController");
jest.mock("../src/sdk/MapController");
jest.mock("../src/sdk/XpDropController");
jest.mock("../src/sdk/utils/Assets");
jest.mock("../src/sdk/utils/SoundCache");
jest.mock("three", () => ({
  Object3D: class Object3D {
    position = new MockVector3();
    rotation = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    children: any[] = [];
    parent: any = null;
    userData: any = {};

    add(object: any) {
      this.children.push(object);
      object.parent = this;
    }

    remove(object: any) {
      const index = this.children.indexOf(object);
      if (index !== -1) {
        this.children.splice(index, 1);
        object.parent = null;
      }
    }

    traverse(callback: (object: any) => void) {
      callback(this);
      this.children.forEach(child => child.traverse?.(callback));
    }

    clear() {
      this.children = [];
    }
  },
  Scene: class Scene {
    position = new MockVector3();
    rotation = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    children: any[] = [];
    parent: any = null;
    userData: any = {};
    background = null;

    public add(object: any): void {
      this.children.push(object);
      object.parent = this;
    }

    remove(object: any) {
      const index = this.children.indexOf(object);
      if (index !== -1) {
        this.children.splice(index, 1);
        object.parent = null;
      }
    }

    traverse(callback: (object: any) => void) {
      callback(this);
      this.children.forEach(child => child.traverse?.(callback));
    }

    clear() {
      this.children = [];
    }
  },
  PerspectiveCamera: class PerspectiveCamera {
    position = new MockVector3();
    rotation = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    children: any[] = [];
    parent: any = null;
    userData: any = {};

    constructor(public fov: number, public aspect: number, public near: number, public far: number) {}

    add(object: any) {
      this.children.push(object);
      object.parent = this;
    }
  },
  WebGLRenderer: class WebGlRenderer {
    domElement = document.createElement('canvas');

    constructor(options?: any) {}

    public render(): void {
      return;
    }
    public setSize(): void {
      return;
    }
    public setPixelRatio(): void {
      return;
    }
  },
  Raycaster: class Raycaster {
    ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } };
    params = {
      Points: { threshold: 0.1 },
      Line: { threshold: 0.1 },
    };

    setFromCamera(coords: any, camera: any) {}

    intersectObjects(objects: any[], recursive?: boolean) {
      return [];
    }
  },
  Vector2: class Vector2 {
    constructor(public x = 0, public y = 0) {}
  },
  Vector3: class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    copy(v: any) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }

    add(v: any) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }

    sub(v: any) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }

    normalize() {
      const length = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
      if (length > 0) {
        this.x /= length;
        this.y /= length;
        this.z /= length;
      }
      return this;
    }
  },
  Plane: class Plane {
    constructor(public normal = {x: 0, y: 1, z: 0}, public constant = 0) {}
  },
  Color: class Color {
    constructor(public r = 1, public g = 1, public b = 1) {}
  },
  Clock: class Clock {
    getElapsedTime() {
      return 0;
    }
    getDelta() {
      return 0;
    }
  },
  LineBasicMaterial: class LineBasicMaterial {
    constructor(params?: any) {}
  },
  BoxGeometry: class BoxGeometry {
    constructor(width?: number, height?: number, depth?: number) {}
  },
  BufferGeometry: class BufferGeometry {
    setFromPoints(points: any[]) {
      return this;
    }
  },
  EdgesGeometry: class EdgesGeometry {
    constructor(geometry?: any) {}
  },
  LineSegments: class LineSegments {
    position = new MockVector3();
    rotation = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    userData: any = {};
    renderOrder = 0;
    constructor(geometry?: any, material?: any) {}
  },
  Mesh: class Mesh {
    position = new MockVector3();
    rotation = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    userData: any = {};
    constructor(geometry?: any, material?: any) {}
  },
  MeshBasicMaterial: class MeshBasicMaterial {
    constructor(params?: any) {}
  },
  PlaneGeometry: class PlaneGeometry {
    constructor(width?: number, height?: number) {}
  },
  Texture: class Texture {
    needsUpdate = false;
    constructor(canvas?: any) {}
  },
  GLTFLoader: class GLTFLoader {
    constructor() {}
    setMeshoptDecoder() {
      return this;
    }
    load(url: string, onLoad: Function, onProgress?: Function, onError?: Function) {
      // Mock implementation
      setTimeout(() => onError?.(new Error('Mock GLTF loader')), 0);
    }
  },
}));
jest.spyOn(document, "getElementById").mockImplementation((elementId: string) => {
  const c = document.createElement("canvas");
  c.ariaLabel = elementId;
  return c;
});

// Mock HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function(contextId: string, options?: any) {
  return mockCanvasContext as any;
};

Random.setRandom(() => {
  if (nextRandom.length > 0) {
    return nextRandom.shift();
  }
  Random.memory = (Random.memory + 13.37) % 180;
  return Math.abs(Math.sin(Random.memory * 0.0174533));
});

Settings.readFromStorage();
  
export const forceRandom = (value: number) => {
  nextRandom.push(value);
};