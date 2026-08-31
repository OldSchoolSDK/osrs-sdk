// Mock implementation for three/examples modules

import { Scene } from './three';

// Mock GLTFLoader
export class GLTFLoader {
  setMeshoptDecoder(decoder: any) {
    // Mock implementation - do nothing
    return this;
  }

  load(url: string, onLoad: Function, onProgress?: Function, onError?: Function) {
    // Mock implementation - just call onError to prevent hanging
    setTimeout(() => onError?.(new Error('Mock GLTF loader')), 0);
  }
}

// Mock GLTF type
export interface GLTF {
  scene: Scene;
  scenes: Scene[];
  animations: any[];
  cameras: any[];
  asset: any;
  parser: any;
  userData: any;
}

// Mock MeshoptDecoder
export const MeshoptDecoder = {
  ready: Promise.resolve(),
  supported: true,
};

// Mock Stats for performance monitoring
class Stats {
  dom = document.createElement('div');
  begin() {}
  end() {}
  update() {}
  setMode(mode: number) {}
}

// Export Stats as default for stats.module import
export default Stats;
