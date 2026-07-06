import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

interface SplatViewerProps {
  url: string;
  format: 'ksplat' | 'splat' | 'ply' | 'spz' | '';
  quality: 'performance' | 'balanced' | 'cinematic';
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material?.dispose();
    }
  });
}

function createFallbackAvatar() {
  const group = new THREE.Group();
  group.position.set(0, -0.25, 0);

  const face = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshStandardMaterial({
      color: '#f1d4c8',
      roughness: 0.42,
      metalness: 0.02,
    }),
  );
  face.scale.set(0.9, 1.15, 0.38);
  group.add(face);

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: '#88b7d9',
    emissive: '#1c5f9b',
    emissiveIntensity: 0.18,
    roughness: 0.25,
  });

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 24), eyeMaterial);
  leftEye.position.set(-0.28, 0.12, 0.36);
  leftEye.scale.set(1.4, 0.7, 0.35);
  group.add(leftEye);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.28;
  group.add(rightEye);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.025, 0.02),
    new THREE.MeshStandardMaterial({ color: '#9b5361', roughness: 0.5 }),
  );
  mouth.position.set(0, -0.34, 0.37);
  group.add(mouth);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.48),
    new THREE.MeshStandardMaterial({ color: '#c9b49f', roughness: 0.58 }),
  );
  hair.position.set(0, 0.42, 0.03);
  hair.scale.set(0.94, 0.62, 0.42);
  group.add(hair);

  return group;
}

function getSceneFormat(format: SplatViewerProps['format']) {
  const sceneFormat = (GaussianSplats3D as any).SceneFormat;

  switch (format) {
    case 'ksplat':
      return sceneFormat.KSplat;
    case 'splat':
      return sceneFormat.Splat;
    case 'ply':
      return sceneFormat.Ply;
    case 'spz':
      return sceneFormat.Spz;
    default:
      return undefined;
  }
}

export function SplatViewer({ url, format, quality }: SplatViewerProps) {
  const { scene } = useThree();
  const viewerRef = useRef<GaussianSplats3D.DropInViewer | null>(null);
  const fallbackRef = useRef<THREE.Group | null>(null);
  const ignoreDevicePixelRatio = quality === 'performance';
  const halfPrecisionCovariancesOnGPU = quality !== 'cinematic';

  useEffect(() => {
    let cancelled = false;

    const showFallbackAvatar = () => {
      if (fallbackRef.current) return;

      const fallback = createFallbackAvatar();
      fallbackRef.current = fallback;
      scene.add(fallback);
    };

    if (!url) {
      showFallbackAvatar();

      return () => {
        if (fallbackRef.current) {
          scene.remove(fallbackRef.current);
          disposeObject(fallbackRef.current);
          fallbackRef.current = null;
        }
      };
    }

    // Initialize the DropInViewer
    const viewer = new GaussianSplats3D.DropInViewer({
      ignoreDevicePixelRatio,
      gpuArchitecturePreference: 'high-performance',
      halfPrecisionCovariancesOnGPU,
      sharedMemoryForWorkers: false
    });

    viewerRef.current = viewer;
    scene.add(viewer);

    const handleLoadFailure = (err: unknown) => {
      if (cancelled) return;

      console.warn("Could not load splat asset. Showing local placeholder avatar.", err);
      scene.remove(viewer);
      viewer.dispose();
      viewerRef.current = null;
      showFallbackAvatar();
    };

    try {
      viewer.addSplatScene(url, {
        showLoadingUI: false,
        format: getSceneFormat(format),
        position: [0, -1.5, 0], // Adjust these to center the avatar
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      }).then(() => {
        console.log("Splat loaded!");
      }).catch(handleLoadFailure);
    } catch (err) {
      handleLoadFailure(err);
    }

    return () => {
      cancelled = true;

      // Cleanup on unmount
      if (viewerRef.current) {
        scene.remove(viewerRef.current);
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
      if (fallbackRef.current) {
        scene.remove(fallbackRef.current);
        disposeObject(fallbackRef.current);
        fallbackRef.current = null;
      }
    };
  }, [url, format, scene, ignoreDevicePixelRatio, halfPrecisionCovariancesOnGPU]);

  // Update the viewer every frame
  useFrame((state) => {
    if (viewerRef.current) {
      // Note: In Phase 2, we will apply the Float32Array offsets here.
      // e.g., updating position buffers based on WebRTC data channel events.
    }

    if (fallbackRef.current) {
      fallbackRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.35) * 0.08;
    }
  });

  return null;
}
