"use client";

import { Canvas } from "@react-three/fiber";
import {
  Center,
  Environment,
  OrbitControls,
  useGLTF
} from "@react-three/drei";

import * as THREE from "three";

type Props = {
  modelUrl: string;
};


function VexaModel({
  modelUrl
}: Props) {

  const { scene } =
    useGLTF(modelUrl);

  scene.traverse(
    (object) => {

      if (
        object instanceof THREE.Mesh
      ) {

        object.castShadow = true;

        object.receiveShadow = true;

        object.geometry.computeVertexNormals();

        const material =
          object.material;

        const materials =
          Array.isArray(material)
            ? material
            : [material];

        materials.forEach(
          (mat) => {

            mat.side =
              THREE.DoubleSide;

            mat.needsUpdate = true;

            if (
              mat instanceof
              THREE.MeshStandardMaterial
            ) {

              mat.roughness = 0.48;

              mat.metalness = 0.0;

              if (mat.map) {

                mat.map.colorSpace =
                  THREE.SRGBColorSpace;

                mat.map.anisotropy = 8;

                mat.map.needsUpdate = true;
              }
            }

            if (
              mat instanceof
              THREE.MeshPhysicalMaterial
            ) {

              mat.roughness = 0.45;

              mat.metalness = 0.0;

              mat.clearcoat = 0.08;

              if (mat.map) {

                mat.map.colorSpace =
                  THREE.SRGBColorSpace;

                mat.map.anisotropy = 8;

                mat.map.needsUpdate = true;
              }
            }
          }
        );
      }
    }
  );

  return (
    <primitive
      object={scene}
      dispose={null}
    />
  );
}


export default function ModelViewer({
  modelUrl
}: Props) {

  return (
    <Canvas
      key={modelUrl}
      shadows
      dpr={[1, 2]}
      camera={{
        position: [
          0,
          0,
          3.4
        ],
        fov: 40
      }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference:
          "high-performance"
      }}
    >

      <color
        attach="background"
        args={["#070b11"]}
      />

      <ambientLight
        intensity={1.8}
      />

      <directionalLight
        position={[
          3,
          5,
          5
        ]}
        intensity={3.2}
        castShadow
      />

      <directionalLight
        position={[
          -4,
          2,
          2
        ]}
        intensity={1.7}
      />

      <directionalLight
        position={[
          0,
          -2,
          -4
        ]}
        intensity={1.1}
      />

      <Environment
        preset="studio"
        environmentIntensity={0.45}
      />

      <Center>
        <VexaModel
          key={modelUrl}
          modelUrl={modelUrl}
        />
      </Center>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minDistance={1.4}
        maxDistance={6}
        target={[
          0,
          0,
          0
        ]}
      />

    </Canvas>
  );
}