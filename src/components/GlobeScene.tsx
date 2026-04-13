import { useEffect, useRef } from "react";
import {
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
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
import type {
  PhysicalConstants,
  SimulationClock,
  SimulationFrame,
} from "../../state";
import {
  getCloudRotationRad,
  getEarthRotationRad,
  getGroundStationLocalVector,
  getPulseScale,
  getSatelliteInertialLocalVector,
  getSatellitePathLocalPositions,
} from "../lib/simulation-visuals";
import type { GroundStation } from "../types";

declare global {
  interface Window {
    __globeDebug?: {
      getCameraPosition: () => { x: number; y: number; z: number };
      getCameraDistance: () => number;
      getControlsTarget: () => { x: number; y: number; z: number };
      getStationScreenPosition: () => { x: number; y: number };
      getEarthRotationY: () => number;
      getDisplayedUnixMs: () => number;
      getSatelliteWorldPosition: () => { x: number; y: number; z: number };
      isAnimating: () => boolean;
    };
    __globeTestAnimationMs?: number;
  }
}

type GlobeSceneProps = {
  clock: SimulationClock;
  frame: SimulationFrame;
  frames: readonly SimulationFrame[];
  groundStation: GroundStation;
  physicalConstants: PhysicalConstants;
  selectedStation: GroundStation | null;
  onGroundStationHover: (
    hover: { station: GroundStation; x: number; y: number } | null,
  ) => void;
  onGroundStationSelect: (station: GroundStation) => void;
};

type SceneHandles = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  renderer: WebGLRenderer;
  earthGroup: Group;
  inertialGroup: Group;
  cloudLayer: Mesh;
  stationMarker: Mesh;
  stationPulse: Mesh;
  satelliteMarker: Mesh;
  satelliteGlow: Mesh;
  stationWorldPosition: Vector3;
  satelliteWorldPosition: Vector3;
};

const EARTH_RADIUS = 2.25;
const EARTH_TEXTURE_URL = "/textures/earth-blue-marble-topography.jpg";
const DEFAULT_CAMERA_DISTANCE = Math.hypot(0, 1.35, 6.4);
const DEFAULT_ROTATE_SPEED = 0.55;
const ZOOM_ANIMATION_MS = 650;

export function GlobeScene({
  clock,
  frame,
  frames,
  groundStation,
  physicalConstants,
  selectedStation,
  onGroundStationHover,
  onGroundStationSelect,
}: GlobeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneHandles | null>(null);
  const currentFrameRef = useRef(frame);
  const selectionTransitionRef = useRef<{
    previous: GroundStation | null;
    current: GroundStation | null;
  }>({
    previous: selectedStation,
    current: selectedStation,
  });

  useEffect(() => {
    currentFrameRef.current = frame;
    applyFrameToScene(sceneRef.current, clock, physicalConstants, frame);
  }, [clock, frame, physicalConstants]);

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

    const earthGroup = new Group();
    scene.add(earthGroup);
    const inertialGroup = new Group();
    scene.add(inertialGroup);

    const earth = new Mesh(
      new SphereGeometry(EARTH_RADIUS, 128, 128),
      new MeshPhongMaterial({
        color: "#16395f",
        shininess: 18,
        specular: "#244c69",
      }),
    );
    earthGroup.add(earth);

    new TextureLoader().load(EARTH_TEXTURE_URL, (texture) => {
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
    earthGroup.add(cloudLayer);

    const atmosphere = new Mesh(
      new SphereGeometry(EARTH_RADIUS * 1.035, 96, 96),
      new MeshBasicMaterial({
        color: "#3b82f6",
        transparent: true,
        opacity: 0.14,
        side: BackSide,
      }),
    );
    earthGroup.add(atmosphere);

    const stationLocalPosition = getGroundStationLocalVector(
      groundStation,
      EARTH_RADIUS * 1.018,
    );
    const stationMarker = new Mesh(
      new SphereGeometry(0.055, 32, 32),
      new MeshBasicMaterial({ color: "#38bdf8" }),
    );
    stationMarker.position.set(
      stationLocalPosition.x,
      stationLocalPosition.y,
      stationLocalPosition.z,
    );
    stationMarker.userData.stationId = groundStation.id;
    earthGroup.add(stationMarker);

    const stationPulse = new Mesh(
      new SphereGeometry(0.09, 32, 32),
      new MeshBasicMaterial({
        color: "#60a5fa",
        transparent: true,
        opacity: 0.26,
      }),
    );
    stationPulse.position.copy(stationMarker.position);
    earthGroup.add(stationPulse);

    const satellitePath = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: "#f59e0b",
        transparent: true,
        opacity: 0.5,
      }),
    );
    satellitePath.geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        getSatellitePathLocalPositions(frames, physicalConstants, EARTH_RADIUS),
        3,
      ),
    );
    inertialGroup.add(satellitePath);

    const satelliteMarker = new Mesh(
      new SphereGeometry(0.065, 32, 32),
      new MeshBasicMaterial({ color: "#f59e0b" }),
    );
    inertialGroup.add(satelliteMarker);

    const satelliteGlow = new Mesh(
      new SphereGeometry(0.12, 32, 32),
      new MeshBasicMaterial({
        color: "#fde68a",
        transparent: true,
        opacity: 0.2,
      }),
    );
    inertialGroup.add(satelliteGlow);

    scene.add(createStarField());

    const stationWorldPosition = new Vector3();
    const satelliteWorldPosition = new Vector3();
    stationMarker.getWorldPosition(stationWorldPosition);
    camera.position.copy(
      stationWorldPosition.clone().normalize().multiplyScalar(DEFAULT_CAMERA_DISTANCE),
    );

    const handles: SceneHandles = {
      camera,
      controls,
      renderer,
      earthGroup,
      inertialGroup,
      cloudLayer,
      stationMarker,
      stationPulse,
      satelliteMarker,
      satelliteGlow,
      stationWorldPosition,
      satelliteWorldPosition,
    };
    sceneRef.current = handles;
    applyFrameToScene(handles, clock, physicalConstants, currentFrameRef.current);

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

    const getProjectedStationScreenPosition = () => {
      stationMarker.getWorldPosition(stationWorldPosition);
      const rect = renderer.domElement.getBoundingClientRect();
      const projected = stationWorldPosition.clone().project(camera);
      return {
        projected,
        x: ((projected.x + 1) / 2) * rect.width + rect.left,
        y: ((1 - projected.y) / 2) * rect.height + rect.top,
      };
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
        const { x, y } = getProjectedStationScreenPosition();
        return { x, y };
      },
      getEarthRotationY: () => earthGroup.rotation.y,
      getDisplayedUnixMs: () => currentFrameRef.current.currentUnixMs,
      getSatelliteWorldPosition: () => {
        satelliteMarker.getWorldPosition(satelliteWorldPosition);
        return {
          x: satelliteWorldPosition.x,
          y: satelliteWorldPosition.y,
          z: satelliteWorldPosition.z,
        };
      },
      isAnimating: () => zoomAnimation !== null,
    };

    const intersectsStationMarker = (event: PointerEvent) => {
      const { projected, x, y } = getProjectedStationScreenPosition();
      const distancePx = Math.hypot(event.clientX - x, event.clientY - y);
      return projected.z < 1 && distancePx < 22;
    };

    const onPointerMove = (event: PointerEvent) => {
      isHoveringStation = intersectsStationMarker(event);
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

      if (movedPx > 6 || !intersectsStationMarker(event)) return;

      onGroundStationSelect(groundStation);
      stationMarker.getWorldPosition(stationWorldPosition);
      animateCameraTo(stationWorldPosition.clone().normalize().multiplyScalar(4.15));
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
      stationMarker.scale.setScalar(isHoveringStation ? 1.28 : 1);
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
      sceneRef.current = null;
      earth.geometry.dispose();
      cloudLayer.geometry.dispose();
      atmosphere.geometry.dispose();
      stationMarker.geometry.dispose();
      stationPulse.geometry.dispose();
      satelliteMarker.geometry.dispose();
      satelliteGlow.geometry.dispose();
      satellitePath.geometry.dispose();
      (satellitePath.material as LineBasicMaterial).dispose();
    };
  }, [
    clock,
    frames,
    groundStation,
    onGroundStationHover,
    onGroundStationSelect,
    physicalConstants,
  ]);

  useEffect(() => {
    selectionTransitionRef.current = {
      previous: selectionTransitionRef.current.current,
      current: selectedStation,
    };
  }, [selectedStation]);

  return <div ref={mountRef} className="globe-scene" aria-label="3D Earth scene" />;
}

function applyFrameToScene(
  handles: SceneHandles | null,
  clock: SimulationClock,
  physicalConstants: PhysicalConstants,
  frame: SimulationFrame,
) {
  if (!handles) return;

  const satelliteInertialLocalPosition = getSatelliteInertialLocalVector(
    frame,
    physicalConstants,
    EARTH_RADIUS,
  );

  handles.earthGroup.rotation.y = getEarthRotationRad(frame.currentUnixMs);
  handles.cloudLayer.rotation.y = getCloudRotationRad(frame.currentUnixMs);
  handles.stationPulse.scale.setScalar(getPulseScale(clock, frame.currentUnixMs));
  handles.inertialGroup.rotation.y = 0;
  handles.satelliteMarker.position.set(
    satelliteInertialLocalPosition.x,
    satelliteInertialLocalPosition.y,
    satelliteInertialLocalPosition.z,
  );
  handles.satelliteGlow.position.copy(handles.satelliteMarker.position);
  handles.satelliteGlow.scale.setScalar(1 + getPulseScale(clock, frame.currentUnixMs) * 0.16);
  handles.stationMarker.getWorldPosition(handles.stationWorldPosition);
  handles.satelliteMarker.getWorldPosition(handles.satelliteWorldPosition);
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
