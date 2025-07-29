import { Environment, OrbitControls, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Avatar } from "./Avatar";
import { useEffect } from "react";


export const Experience = () => {
  const texture = useTexture("textures/sala.jpg");
  const viewport = useThree((state) => state.viewport);

  const { gl } = useThree();

  useEffect(() => {
    gl.domElement.style.pointerEvents = "none";
    return () => {
      gl.domElement.style.pointerEvents = "";
    };
  }, [gl]);


  return (
    <>
      <Avatar position={[-0.8, -3.8, 5]} scale={2.6} />
      <Environment preset="sunset" />
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </>
  );
};
