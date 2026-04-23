import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type PointCloudPoint = {
  x: number;
  y: number;
  z: number;
  intensity?: number;
};

export function PointCloudView({ points }: { points: PointCloudPoint[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#08111f');

    const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.1, 1000);
    camera.position.set(0, 6, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const grid = new THREE.GridHelper(18, 18, 0x2dffb6, 0x123347);
    scene.add(grid);

    const material = new THREE.PointsMaterial({ size: 0.12, vertexColors: true });
    const geometry = new THREE.BufferGeometry();
    const cloud = new THREE.Points(geometry, material);
    scene.add(cloud);
    pointsRef.current = cloud;

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    let frameId = 0;
    const renderLoop = () => {
      frameId = requestAnimationFrame(renderLoop);
      cloud.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    renderLoop();

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resizeObserver.observe(host);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const cloud = pointsRef.current;
    if (!cloud) {
      return;
    }

    const geometry = cloud.geometry;
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    points.forEach((point, index) => {
      const offset = index * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
      const intensity = point.intensity ?? 0.5;
      colors[offset] = 0.2 + intensity * 0.4;
      colors[offset + 1] = 0.5 + intensity * 0.4;
      colors[offset + 2] = 1 - intensity * 0.3;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
  }, [points]);

  return <div className="point-cloud" ref={hostRef} />;
}
