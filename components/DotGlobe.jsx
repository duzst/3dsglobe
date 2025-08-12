"use client";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Interactive point-cloud globe with:
// - Color picker + random color
// - Dot count/size
// - Auto-rotate + speed
// - Hover scatter: nearby particles repel and relax back
export default function DotGlobe() {
  const containerRef = useRef(null);

  // UI state
  const [pointCount, setPointCount] = useState(3500);
  const [dotSize, setDotSize] = useState(0.01);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotateSpeed, setRotateSpeed] = useState(0.6);
  const [color, setColor] = useState("#bcd2ff");
  const [scatterEnabled, setScatterEnabled] = useState(true);
  const [scatterRadius, setScatterRadius] = useState(0.35);
  const [scatterStrength, setScatterStrength] = useState(0.015);

  // Three.js refs
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const pointsRef = useRef(null);
  const raycasterRef = useRef(null);
  const mouseRef = useRef(new THREE.Vector2());
  const interactionSphereRef = useRef(null);

  // Physics buffers
  const basePositionsRef = useRef(null);
  const displacementsRef = useRef(null);
  const hoverPointRef = useRef(new THREE.Vector3());
  const isHoveringRef = useRef(false);

  // Init Three once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 2.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    container.style.background =
      "radial-gradient(1200px 800px at 20% 15%, rgba(120, 160, 255, 0.18), transparent), radial-gradient(900px 700px at 80% 85%, rgba(255, 120, 200, 0.10), transparent), #0b1021";

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 5, 5);
    scene.add(ambient, dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = rotateSpeed;
    controlsRef.current = controls;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.03 };
    raycasterRef.current = raycaster;

    // Invisible sphere for precise hover hit on the globe surface
    const globeHit = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    scene.add(globeHit);
    interactionSphereRef.current = globeHit;

    // Create dots
    const points = createPointCloud(pointCount, dotSize, color);
    scene.add(points);
    pointsRef.current = points;

    // Physics buffers
    const posAttr = points.geometry.getAttribute("position");
    basePositionsRef.current = new Float32Array(posAttr.array); // copy
    displacementsRef.current = new Float32Array(posAttr.array.length); // zeros

    // Resize
    const onResize = () => {
      if (!container) return;
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Pointer
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (!raycasterRef.current || !interactionSphereRef.current) return;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const hits = raycasterRef.current.intersectObject(interactionSphereRef.current);
      if (hits.length) {
        hoverPointRef.current.copy(hits[0].point);
        isHoveringRef.current = true;
      } else {
        isHoveringRef.current = false;
      }
    };
    const onPointerLeave = () => { isHoveringRef.current = false; };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    // Animate
    let stopped = false;
    const decay = 0.92;
    const animate = () => {
      if (stopped) return;
      requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.autoRotate = autoRotate;
        controlsRef.current.autoRotateSpeed = rotateSpeed;
        controlsRef.current.update();
      }

      if (pointsRef.current) {
        applyScatterPhysics(
          pointsRef.current,
          basePositionsRef.current,
          displacementsRef.current,
          scatterEnabled && isHoveringRef.current ? hoverPointRef.current : null,
          scatterRadius,
          scatterEnabled ? scatterStrength : 0, // when disabled, still relax
          decay
        );
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      stopped = true;
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      if (pointsRef.current) {
        disposePoints(pointsRef.current);
        scene.remove(pointsRef.current);
        pointsRef.current = null;
      }
      if (interactionSphereRef.current) {
        scene.remove(interactionSphereRef.current);
        interactionSphereRef.current.geometry.dispose();
        interactionSphereRef.current.material.dispose();
      }
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild on count/size change
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    if (pointsRef.current) {
      disposePoints(pointsRef.current);
      scene.remove(pointsRef.current);
      pointsRef.current = null;
    }
    const fresh = createPointCloud(pointCount, dotSize, color);
    scene.add(fresh);
    pointsRef.current = fresh;

    const posAttr = fresh.geometry.getAttribute("position");
    basePositionsRef.current = new Float32Array(posAttr.array);
    displacementsRef.current = new Float32Array(posAttr.array.length);
  }, [pointCount, dotSize]);

  // Update color live
  useEffect(() => {
    if (pointsRef.current) {
      pointsRef.current.material.color = new THREE.Color(color);
      pointsRef.current.material.needsUpdate = true;
    }
  }, [color]);

  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(0, 0, 2.8);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleRandomColor = () => {
    const h = Math.random();
    const s = 0.5 + Math.random() * 0.3;
    const l = 0.55 + Math.random() * 0.25;
    const col = new THREE.Color().setHSL(h, s, l);
    setColor(`#${col.getHexString()}`);
  };

  const clearScatter = () => {
    if (!pointsRef.current || !displacementsRef.current) return;
    displacementsRef.current.fill(0);
    const posAttr = pointsRef.current.geometry.getAttribute("position");
    posAttr.array.set(basePositionsRef.current);
    posAttr.needsUpdate = true;
  };

  return (
    <div className="relative w-full h-[80vh] rounded-2xl overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 bg-black/40 text-white backdrop-blur-md p-4 rounded-2xl shadow-lg space-y-3 min-w-[280px]">
        <div className="text-sm opacity-90">Interactive Dot Globe</div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-6 w-10 rounded-md border border-white/20 bg-transparent"
          />
          <button onClick={handleRandomColor} className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs">
            Random
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Dot count</label>
          <input
            type="range"
            min={800}
            max={12000}
            step={200}
            value={pointCount}
            onChange={(e) => setPointCount(parseInt(e.target.value, 10))}
            className="w-40"
          />
          <span className="text-xs tabular-nums opacity-80 w-12 text-right">{pointCount}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Dot size</label>
          <input
            type="range"
            min={0.006}
            max={0.03}
            step={0.002}
            value={dotSize}
            onChange={(e) => setDotSize(parseFloat(e.target.value))}
            className="w-40"
          />
          <span className="text-xs tabular-nums opacity-80 w-12 text-right">{dotSize.toFixed(3)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Scatter on hover</label>
          <input type="checkbox" checked={scatterEnabled} onChange={(e) => setScatterEnabled(e.target.checked)} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Scatter radius</label>
          <input
            type="range"
            min={0.15}
            max={0.8}
            step={0.01}
            value={scatterRadius}
            onChange={(e) => setScatterRadius(parseFloat(e.target.value))}
            className="w-40"
          />
          <span className="text-xs tabular-nums opacity-80 w-12 text-right">{scatterRadius.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Scatter strength</label>
          <input
            type="range"
            min={0.004}
            max={0.05}
            step={0.001}
            value={scatterStrength}
            onChange={(e) => setScatterStrength(parseFloat(e.target.value))}
            className="w-40"
          />
          <span className="text-xs tabular-nums opacity-80 w-12 text-right">{scatterStrength.toFixed(3)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Auto-rotate</label>
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-xs opacity-80">Rotate speed</label>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={rotateSpeed}
            onChange={(e) => setRotateSpeed(parseFloat(e.target.value))}
            className="w-40"
          />
          <span className="text-xs tabular-nums opacity-80 w-12 text-right">{rotateSpeed.toFixed(1)}</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleResetCamera} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition text-xs">
            Reset camera
          </button>
          <button onClick={clearScatter} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition text-xs">
            Clear scatter
          </button>
        </div>
      </div>
    </div>
  );
}

// Helpers
function createPointCloud(count = 4000, size = 0.01, hexColor = "#bcd2ff") {
  const radius = 1;
  const positions = new Float32Array(count * 3);
  const golden = (1 + Math.sqrt(5)) / 2;
  const angleInc = (2 * Math.PI) / golden;

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = 1 - 2 * t;
    const r = Math.sqrt(1 - y * y);
    const phi = i * angleInc;
    const x = Math.cos(phi) * r;
    const z = Math.sin(phi) * r;
    positions[i * 3 + 0] = x * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(hexColor),
    size: size,
    sizeAttenuation: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });

  const points = new THREE.Points(geometry, material);
  points.rotation.y = 0.8;
  points.rotation.x = -0.2;
  return points;
}

function disposePoints(points) {
  if (!points) return;
  if (points.geometry) points.geometry.dispose();
  if (points.material) points.material.dispose();
}

function applyScatterPhysics(
  points,
  basePositions,
  displacements,
  hoverPoint, // THREE.Vector3 or null
  radius = 0.35,
  strength = 0.015,
  decay = 0.92
) {
  if (!points || !basePositions || !displacements) return;
  const posAttr = points.geometry.getAttribute("position");
  const arr = posAttr.array;
  const n = arr.length / 3;

  // Repulsion on hover
  if (hoverPoint) {
    const cx = hoverPoint.x, cy = hoverPoint.y, cz = hoverPoint.z;
    const r2 = radius * radius;
    for (let i = 0; i < n; i++) {
      const bi = i * 3;
      const dx = basePositions[bi] - cx;
      const dy = basePositions[bi + 1] - cy;
      const dz = basePositions[bi + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) {
        const d = Math.sqrt(Math.max(d2, 1e-6));
        const falloff = 1 - d / radius; // 0..1
        const s = strength * falloff * falloff;
        displacements[bi]     += (dx / d) * s;
        displacements[bi + 1] += (dy / d) * s;
        displacements[bi + 2] += (dz / d) * s;
      }
    }
  }

  // Damping + apply
  for (let i = 0; i < n; i++) {
    const bi = i * 3;
    displacements[bi]     *= decay;
    displacements[bi + 1] *= decay;
    displacements[bi + 2] *= decay;

    arr[bi]     = basePositions[bi]     + displacements[bi];
    arr[bi + 1] = basePositions[bi + 1] + displacements[bi + 1];
    arr[bi + 2] = basePositions[bi + 2] + displacements[bi + 2];
  }
  posAttr.needsUpdate = true;
}
