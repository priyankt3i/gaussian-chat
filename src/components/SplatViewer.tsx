import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

interface SplatViewerProps {
  url: string;
}

export function SplatViewer({ url }: SplatViewerProps) {
  const { scene, gl, camera } = useThree();
  const viewerRef = useRef<GaussianSplats3D.DropInViewer | null>(null);

  useEffect(() => {
    // Initialize the DropInViewer
    const viewer = new GaussianSplats3D.DropInViewer({
      ignoreDevicePixelRatio: false,
      gpuArchitecturePreference: 'high-performance',
      halfPrecisionCovariancesOnGPU: true,
      sharedMemoryForWorkers: false
    });

    viewerRef.current = viewer;
    scene.add(viewer);

    // Load the splat file
    viewer.addSplatScene(url, {
      showLoadingUI: false,
      position: [0, -1.5, 0], // Adjust these to center the avatar
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    }).then(() => {
      console.log("Splat loaded!");
    }).catch((err) => {
      console.error("Error loading splat:", err);
    });

    return () => {
      // Cleanup on unmount
      if (viewerRef.current) {
        scene.remove(viewerRef.current);
        viewerRef.current.dispose();
      }
    };
  }, [url, scene]);

  // Update the viewer every frame
  useFrame(() => {
    if (viewerRef.current) {
      // Note: In Phase 2, we will apply the Float32Array offsets here.
      // e.g., updating position buffers based on WebRTC data channel events.
    }
  });

  return null;
}
