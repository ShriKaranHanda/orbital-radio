import { useEffect, useRef } from "react";
import {
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { latLonToUnitVector } from "../lib/geo";
import type { GroundStation } from "../types";

declare global {
  interface Window {
    __globeDebug?: {
      getCameraPosition: () => { x: number; y: number; z: number };
      getCameraDistance: () => number;
      getControlsTarget: () => { x: number; y: number; z: number };
      getStationScreenPosition: () => { x: number; y: number };
      isAnimating: () => boolean;
    };
    __globeTestAnimationMs?: number;
  }
}

type GlobeSceneProps = {
  groundStation: GroundStation;
  selectedStation: GroundStation | null;
  onGroundStationHover: (
    hover: { station: GroundStation; x: number; y: number } | null,
  ) => void;
  onGroundStationSelect: (station: GroundStation) => void;
};

const EARTH_RADIUS = 2.25;
const DEFAULT_CAMERA_POSITION = new Vector3(0, 1.35, 6.4);
const DEFAULT_CAMERA_DISTANCE = DEFAULT_CAMERA_POSITION.length();
const DEFAULT_ROTATE_SPEED = 0.55;
const ZOOM_ANIMATION_MS = 650;

// TODO: Make the earth dark mode. Looks better
export function GlobeScene({
  groundStation,
  selectedStation,
  onGroundStationHover,
  onGroundStationSelect,
}: GlobeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectedStationRef = useRef<GroundStation | null>(selectedStation);
  const selectionTransitionRef = useRef<{
    previous: GroundStation | null;
    current: GroundStation | null;
  }>({
    previous: selectedStation,
    current: selectedStation,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.background = new Color("#02040a");

    const camera = new PerspectiveCamera(
      42,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.copy(DEFAULT_CAMERA_POSITION);

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.1;
    controls.maxDistance = 9;
    controls.rotateSpeed = DEFAULT_ROTATE_SPEED;
    controls.target.set(0, 0, 0);

    scene.add(new AmbientLight("#7aa3d8", 1.1));
    const sun = new DirectionalLight("#ffffff", 3.3);
    sun.position.set(-2.2, 1.4, 4.8);
    scene.add(sun);

    const earth = new Mesh(
      new SphereGeometry(EARTH_RADIUS, 128, 128),
      new MeshPhongMaterial({
        color: "#16395f",
        shininess: 18,
        specular: "#244c69",
      }),
    );
    scene.add(earth);

    new TextureLoader().load("/textures/earth-atmos.jpg", (texture) => {
      earth.material.map = texture;
      earth.material.color = new Color("#ffffff");
      earth.material.needsUpdate = true;
    });

    const cloudLayer = new Mesh(
      new SphereGeometry(EARTH_RADIUS * 1.012, 96, 96),
      new MeshBasicMaterial({
        map: makeCloudTexture(),
        transparent: true,
        opacity: 0.18,
      }),
    );
    scene.add(cloudLayer);

    const atmosphere = new Mesh(
      new SphereGeometry(EARTH_RADIUS * 1.035, 96, 96),
      new MeshBasicMaterial({
        color: "#3b82f6",
        transparent: true,
        opacity: 0.14,
        side: BackSide,
      }),
    );
    scene.add(atmosphere);

    const stationDirection = latLonToUnitVector(
      groundStation.latDeg,
      groundStation.lonDeg,
    );
    const stationPosition = stationDirection.clone().multiplyScalar(EARTH_RADIUS * 1.018);
    const marker = new Mesh(
      new SphereGeometry(0.055, 32, 32),
      new MeshBasicMaterial({ color: "#38bdf8" }),
    );
    marker.position.copy(stationPosition);
    marker.userData.stationId = groundStation.id;
    scene.add(marker);

    const pulse = new Mesh(
      new SphereGeometry(0.09, 32, 32),
      new MeshBasicMaterial({
        color: "#60a5fa",
        transparent: true,
        opacity: 0.26,
      }),
    );
    pulse.position.copy(stationPosition);
    scene.add(pulse);

    scene.add(createStarField());

    let isHoveringStation = false;
    let pointerDownPosition: { x: number; y: number } | null = null;
    let zoomAnimation: {
      startedAt: number;
      from: Vector3;
      to: Vector3;
    } | null = null;

    const animateCameraTo = (to: Vector3) => {
      zoomAnimation = {
        startedAt: performance.now(),
        from: camera.position.clone(),
        to,
      };
    };

    const syncSelectionState = () => {
      const selection = selectionTransitionRef.current;
      const wasDeselected = selection.previous !== null && selection.current === null;

      if (wasDeselected) {
        animateCameraTo(camera.position.clone().normalize().multiplyScalar(DEFAULT_CAMERA_DISTANCE));
        selection.previous = selection.current;
      }
    };

    window.__globeDebug = {
      getCameraPosition: () => ({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      }),
      getCameraDistance: () => camera.position.length(),
      getControlsTarget: () => ({
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      }),
      getStationScreenPosition: () => {
        const rect = renderer.domElement.getBoundingClientRect();
        const projected = stationPosition.clone().project(camera);
        return {
          x: ((projected.x + 1) / 2) * rect.width + rect.left,
          y: ((1 - projected.y) / 2) * rect.height + rect.top,
        };
      },
      isAnimating: () => zoomAnimation !== null,
    };

    const intersectsMarker = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const projected = stationPosition.clone().project(camera);
      const markerX = ((projected.x + 1) / 2) * rect.width + rect.left;
      const markerY = ((1 - projected.y) / 2) * rect.height + rect.top;
      const distancePx = Math.hypot(event.clientX - markerX, event.clientY - markerY);
      return projected.z < 1 && distancePx < 22;
    };

    const onPointerMove = (event: PointerEvent) => {
      isHoveringStation = intersectsMarker(event);
      renderer.domElement.style.cursor = isHoveringStation ? "pointer" : "grab";

      if (isHoveringStation) {
        onGroundStationHover({
          station: groundStation,
          x: event.clientX,
          y: event.clientY,
        });
      } else {
        onGroundStationHover(null);
      }
    };

    const onPointerLeave = () => {
      isHoveringStation = false;
      renderer.domElement.style.cursor = "grab";
      onGroundStationHover(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerDownPosition = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDownPosition) return;

      const movedPx = Math.hypot(
        event.clientX - pointerDownPosition.x,
        event.clientY - pointerDownPosition.y,
      );
      pointerDownPosition = null;

      if (movedPx > 6 || !intersectsMarker(event)) return;

      onGroundStationSelect(groundStation);
      const normal = stationPosition.clone().normalize();
      animateCameraTo(normal.multiplyScalar(4.15));
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    resizeObserver.observe(mount);

    let frameId = 0;
    const render = () => {
      frameId = requestAnimationFrame(render);
      cloudLayer.rotation.y += 0.00028;
      pulse.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.18);
      marker.scale.setScalar(isHoveringStation ? 1.28 : 1);
      controls.target.set(0, 0, 0);
      syncSelectionState();

      if (zoomAnimation) {
        const animationDurationMs = window.__globeTestAnimationMs ?? ZOOM_ANIMATION_MS;
        const progress = Math.min(
          (performance.now() - zoomAnimation.startedAt) / animationDurationMs,
          1,
        );
        const eased = 1 - Math.pow(1 - progress, 3);
        camera.position.lerpVectors(zoomAnimation.from, zoomAnimation.to, eased);
        if (progress === 1) {
          zoomAnimation = null;
        }
      }

      const normalizedDistance =
        (camera.position.length() - controls.minDistance) /
        (controls.maxDistance - controls.minDistance);
      controls.rotateSpeed = DEFAULT_ROTATE_SPEED * (0.3 + Math.max(0, normalizedDistance) * 0.7);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      delete window.__globeDebug;
      earth.geometry.dispose();
      cloudLayer.geometry.dispose();
      atmosphere.geometry.dispose();
      marker.geometry.dispose();
      pulse.geometry.dispose();
    };
  }, [groundStation, onGroundStationHover, onGroundStationSelect]);

  useEffect(() => {
    selectedStationRef.current = selectedStation;
    selectionTransitionRef.current = {
      previous: selectionTransitionRef.current.current,
      current: selectedStation,
    };
  }, [selectedStation]);

  return <div ref={mountRef} className="globe-scene" aria-label="3D Earth scene" />;
}

function createStarField() {
  const geometry = new BufferGeometry();
  const positions: number[] = [];

  for (let index = 0; index < 2200; index += 1) {
    const radius = 32 + Math.random() * 26;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
    );
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  return new Points(
    geometry,
    new PointsMaterial({
      color: "#dbeafe",
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.68,
    }),
  );
}

function makeCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 600; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const width = 18 + Math.random() * 70;
    const height = 4 + Math.random() * 18;
    const alpha = 0.04 + Math.random() * 0.1;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.beginPath();
    context.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
