/* Troféu 3D (Three.js).
   A pose da taça é derivada do progresso da linha do tempo da seção (main.js):
   0 → 0.42  era 2026 · gira para frente
   0.42 → 0.62  "rebobina" para 2022 · giro rápido ao contrário
   0.62 → 1  era 2022 · segue girando devagar */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HEIGHT = 2; // altura normalizada da taça, em unidades da cena
const ERA_A = 0.42;
const ERA_B = 0.62;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function initTrophy({ canvas, buffer, state, reduceMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // Reflexos: um "estúdio" com softbox, faixa verde LOUD e brilho dourado.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(createStudio(), 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(3, 5, 6);
  const rimGreen = new THREE.DirectionalLight(0x2dff5a, 1.2);
  rimGreen.position.set(-5, 2, -3);
  const rimGold = new THREE.DirectionalLight(0xffc46b, 2.2);
  rimGold.position.set(5, -1, -4);
  scene.add(key, rimGreen, rimGold, new THREE.AmbientLight(0xffffff, 0.12));

  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
  const model = gltf.scene;

  // Normaliza: centraliza na origem e ajusta a altura para HEIGHT.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = HEIGHT / size.y;
  model.scale.setScalar(scale);
  model.position.copy(center).multiplyScalar(-scale);
  const width = Math.max(size.x, size.z) * scale;

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const mat = obj.material;
    if (/brass/i.test(mat.name)) {
      mat.envMapIntensity = 1.5;
    } else if (/cork/i.test(mat.name)) {
      // A textura original é marrom-cortiça; escurece para a pedra vulcânica da taça real.
      mat.color.setRGB(0.3, 0.29, 0.3);
      mat.envMapIntensity = 0.8;
    }
  });

  const pivot = new THREE.Group(); // gira
  const rig = new THREE.Group(); // posiciona/escala
  pivot.add(model);
  rig.add(pivot);
  scene.add(rig);

  const pedestal = createPedestal(width);
  pedestal.position.y = -HEIGHT / 2 - 0.015;
  rig.add(pedestal);

  const dust = createDust(reduceMotion);
  rig.add(dust.points);

  // ---------- layout responsivo ----------
  let view = { portrait: false, visW: 1, visH: 1 };
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const portrait = camera.aspect < 0.9;
    const hFrac = portrait ? 0.4 : 0.68; // fração da altura da tela ocupada pela taça
    const wFrac = portrait ? 0.6 : 0.36; // fração máxima da largura
    const dist = Math.max(HEIGHT / (hFrac * 2 * tan), width / (wFrac * 2 * tan * camera.aspect));
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    view = { portrait, visH: 2 * dist * tan, visW: 2 * dist * tan * camera.aspect };
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // ---------- interação ----------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // ---------- pose a partir do scroll ----------
  const SPIN = 1.35 * Math.PI;
  const REWIND = 3 * Math.PI;
  const AFTER = 0.9 * Math.PI;

  const pose = (p, enter, t) => {
    let rot;
    if (p <= ERA_A) rot = SPIN * (p / ERA_A);
    else if (p <= ERA_B) rot = SPIN - REWIND * easeInOutCubic((p - ERA_A) / (ERA_B - ERA_A));
    else rot = SPIN - REWIND - AFTER * ((p - ERA_B) / (1 - ERA_B));
    rot += -0.6 - (1 - enter) * 2.2;
    if (!reduceMotion) rot += t * 0.12;

    const rewind = p > ERA_A && p < ERA_B ? Math.sin((Math.PI * (p - ERA_A)) / (ERA_B - ERA_A)) : 0;
    const era = smoothstep(ERA_A - 0.03, ERA_B + 0.02, p); // 0 = 2026 (texto em cima à esquerda) · 1 = 2022
    const fx = view.portrait ? 0 : lerp(0.06, -0.06, era);
    const fy = view.portrait ? lerp(-0.15, 0.12, era) : lerp(-0.02, 0.025, era);

    return {
      rot,
      x: fx * view.visW,
      y: fy * view.visH - (1 - enter) * 0.45 * view.visH,
      scale: (0.82 + 0.18 * enter) * (1 + 0.07 * rewind),
      tiltX: 0.2 * rewind + pointer.y * 0.09,
      tiltZ: -pointer.x * 0.06,
      rewind,
    };
  };

  const cur = { rot: 0, x: 0, y: 0, scale: 1, tiltX: 0, tiltZ: 0 };
  const clock = new THREE.Clock(false);
  let snap = true;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    const p = state.timeline ? state.timeline.progress() : 0;
    const target = pose(p, state.enter ?? 1, t);
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    snap = false;
    for (const key of Object.keys(cur)) cur[key] += (target[key] - cur[key]) * k;

    rig.position.set(cur.x, cur.y, 0);
    rig.scale.setScalar(cur.scale);
    pivot.rotation.set(cur.tiltX, cur.rot, cur.tiltZ);
    pedestal.material.opacity = 0.5 + 0.25 * target.rewind;
    dust.update(dt, target.rewind);

    renderer.render(scene, camera);
  };

  renderer.compile(scene, camera);

  let active = false;
  return {
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) {
        snap = true;
        clock.start();
        renderer.setAnimationLoop(frame);
      } else {
        renderer.setAnimationLoop(null);
        clock.stop();
      }
    },
  };
}

/* ---------------------------------------------------------------- cena auxiliar */

function createStudio() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.032, 0.03), side: THREE.BackSide }),
  ));
  const panel = (hex, intensity, w, h, x, y, z) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(0xffffff, 7, 10, 3, 0, 10, 2); // softbox superior
  panel(0xfff0d6, 5, 2.5, 12, 9, 1, 5); // faixa quente à direita
  panel(0x30ff5a, 1.7, 1.8, 12, -9, 0, 4); // faixa verde LOUD à esquerda
  panel(0xffd08a, 2.5, 14, 1.5, 0, -4, -10); // brilho dourado baixo, atrás
  panel(0xffffff, 1.6, 4, 4, -4, 3, 10); // preenchimento frontal
  return env;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [offset, color] of stops) grd.addColorStop(offset, color);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPedestal(width) {
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 3.2, width * 3.2),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,.5)'], [0.55, 'rgba(255,255,255,.1)'], [1, 'rgba(255,255,255,0)']]),
      color: 0x38ff6a,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(width * 0.78, 0.006, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0x8dffa6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  glow.add(ring); // o toro já nasce no plano XY local do brilho, que está deitado
  return glow;
}

function createDust(still) {
  const COUNT = 320;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = 0.9 + Math.random() * 1.9;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = -1.6 + Math.random() * 3.4;
    positions[i * 3 + 2] = Math.sin(a) * r;
    speeds[i] = 0.04 + Math.random() * 0.12;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.03,
    map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]),
    color: 0xffd98a,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));

  return {
    points,
    update(dt, boost) {
      if (still) return;
      for (let i = 0; i < COUNT; i++) {
        const iy = i * 3 + 1;
        positions[iy] += speeds[i] * dt * (1 + boost * 6);
        if (positions[iy] > 1.8) positions[iy] = -1.6;
      }
      geometry.attributes.position.needsUpdate = true;
      points.rotation.y += dt * (0.05 + boost * 0.6);
    },
  };
}
