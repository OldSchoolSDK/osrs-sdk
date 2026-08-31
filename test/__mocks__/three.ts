// Mock implementation of THREE.js for testing purposes
// Tests don't need actual 3D rendering, just need the objects to exist

export class Object3D {
  position = { x: 0, y: 0, z: 0 };
  rotation = { x: 0, y: 0, z: 0 };
  scale = { x: 1, y: 1, z: 1 };
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
}

export class Scene extends Object3D {
  background = null;
}

export class PerspectiveCamera extends Object3D {
  constructor(public fov: number, public aspect: number, public near: number, public far: number) {
    super();
  }
}

export class WebGLRenderer {
  domElement = document.createElement('canvas');

  constructor(options?: any) {}

  setSize(width: number, height: number) {}

  render(scene: Scene, camera: PerspectiveCamera) {}

  setPixelRatio(ratio: number) {}
}

export class Raycaster {
  ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } };

  setFromCamera(coords: any, camera: any) {}

  intersectObjects(objects: any[], recursive?: boolean) {
    return [];
  }
}

export class Vector2 {
  constructor(public x = 0, public y = 0) {}
}

export class Vector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Vector3) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v: Vector3) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Vector3) {
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
}

export class Plane {
  constructor(public normal = new Vector3(0, 1, 0), public constant = 0) {}
}

export class Color {
  constructor(public r = 1, public g = 1, public b = 1) {}
}
