import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import { Suspense, useRef, useMemo } from 'react';
import * as THREE from 'three';

const generateGalaxyPoints = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const radius = Math.random() * spread;
    const spinAngle = radius * 0.02;
    const branchAngle = (i % 3) * ((2 * Math.PI) / 3);
    
    const x = Math.cos(branchAngle + spinAngle) * radius + (Math.random() - 0.5) * 20;
    const y = (Math.random() - 0.5) * 20;
    const z = Math.sin(branchAngle + spinAngle) * radius + (Math.random() - 0.5) * 20;
    
    positions.set([x, y, z], i * 3);
    
    const mixedColor = new THREE.Color();
    const insideColor = new THREE.Color('#ff6030');
    const outsideColor = new THREE.Color('#1b3984');
    mixedColor.lerpColors(insideColor, outsideColor, radius / spread);
    
    colors.set([mixedColor.r, mixedColor.g, mixedColor.b], i * 3);
  }
  
  return { positions, colors };
};

const generateEllipticalGalaxyPoints = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spread;
    const ellipseRatio = 0.6;
    
    const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 10;
    const y = (Math.random() - 0.5) * spread * 0.3;
    const z = Math.sin(angle) * radius * ellipseRatio + (Math.random() - 0.5) * 10;
    
    positions.set([x, y, z], i * 3);
    const mixedColor = new THREE.Color();
    const insideColor = new THREE.Color('#ffaa00');
    const outsideColor = new THREE.Color('#ff6600');
    mixedColor.lerpColors(insideColor, outsideColor, radius / spread);
    
    colors.set([mixedColor.r, mixedColor.g, mixedColor.b], i * 3);
  }
  
  return { positions, colors };
};

const generateIrregularGalaxyPoints = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const clusterIndex = Math.floor(Math.random() * 3);
    const clusterOffset = [
      [spread * 0.3, 0, 0],
      [-spread * 0.2, spread * 0.2, 0],
      [0, -spread * 0.1, spread * 0.3]
    ][clusterIndex];
    
    const x = (Math.random() - 0.5) * spread * 0.8 + clusterOffset[0] + (Math.random() - 0.5) * 30;
    const y = (Math.random() - 0.5) * spread * 0.6 + clusterOffset[1] + (Math.random() - 0.5) * 30;
    const z = (Math.random() - 0.5) * spread * 0.8 + clusterOffset[2] + (Math.random() - 0.5) * 30;
    
    positions.set([x, y, z], i * 3);
    
    const mixedColor = new THREE.Color();
    const colors_array = [
      new THREE.Color('#ff00ff'),
      new THREE.Color('#8800ff'),
      new THREE.Color('#4400ff')
    ];
    const selectedColor = colors_array[clusterIndex];
    
    colors.set([selectedColor.r, selectedColor.g, selectedColor.b], i * 3);
  }
  
  return { positions, colors };
};

const generateBarredGalaxyPoints = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const radius = Math.random() * spread;
    const angle = Math.random() * Math.PI * 2;
    
    if (radius < spread * 0.3) {
      const barAngle = (Math.random() - 0.5) * Math.PI * 0.5;
      const x = Math.cos(barAngle) * radius * 2 + (Math.random() - 0.5) * 15;
      const y = (Math.random() - 0.5) * 10;
      const z = Math.sin(barAngle) * radius * 0.5 + (Math.random() - 0.5) * 15;
      positions.set([x, y, z], i * 3);
    } else {
      const spinAngle = radius * 0.03;
      const x = Math.cos(angle + spinAngle) * radius + (Math.random() - 0.5) * 20;
      const y = (Math.random() - 0.5) * 15;
      const z = Math.sin(angle + spinAngle) * radius + (Math.random() - 0.5) * 20;
      positions.set([x, y, z], i * 3);
    }
    
    const mixedColor = new THREE.Color();
    const insideColor = new THREE.Color('#00ffaa');
    const outsideColor = new THREE.Color('#0088ff');
    mixedColor.lerpColors(insideColor, outsideColor, radius / spread);
    
    colors.set([mixedColor.r, mixedColor.g, mixedColor.b], i * 3);
  }
  
  return { positions, colors };
};

const EllipticalGalaxy = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
  const galaxyRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => generateEllipticalGalaxyPoints(2000, 40 * scale), [scale]);
  
  useFrame((state) => {
    if (galaxyRef.current) {
      galaxyRef.current.rotation.y -= 0.0003 * scale;
      galaxyRef.current.rotation.x -= 0.0001 * scale;
    }
  });
  
  return (
    <points ref={galaxyRef} position={position} scale={scale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.6 * scale}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        blending={THREE.AdditiveBlending}
        opacity={0.7}
      />
    </points>
  );
};

const IrregularGalaxy = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
  const galaxyRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => generateIrregularGalaxyPoints(1500, 35 * scale), [scale]);
  
  useFrame((state) => {
    if (galaxyRef.current) {
      galaxyRef.current.rotation.y += 0.0005 * scale;
      galaxyRef.current.rotation.z -= 0.0002 * scale;
    }
  });
  
  return (
    <points ref={galaxyRef} position={position} scale={scale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.4 * scale}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        blending={THREE.AdditiveBlending}
        opacity={0.8}
      />
    </points>
  );
};

const BarredGalaxy = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
  const galaxyRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => generateBarredGalaxyPoints(2500, 45 * scale), [scale]);
  
  useFrame((state) => {
    if (galaxyRef.current) {
      galaxyRef.current.rotation.y -= 0.0006 * scale;
      galaxyRef.current.rotation.z += 0.0002 * scale;
    }
  });
  
  return (
    <points ref={galaxyRef} position={position} scale={scale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.5 * scale}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        blending={THREE.AdditiveBlending}
        opacity={0.75}
      />
    </points>
  );
};

const generateNebulaClouds = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spread;
    const height = (Math.random() - 0.5) * spread * 0.4;
    
    const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 40;
    const y = height + (Math.random() - 0.5) * 30;
    const z = Math.sin(angle) * radius + (Math.random() - 0.5) * 40;
    
    positions.set([x, y, z], i * 3);
    
    const nebulaColors = [
      new THREE.Color('#ff1493'),
      new THREE.Color('#00ffff'),
      new THREE.Color('#ff4500'),
      new THREE.Color('#9932cc'),
      new THREE.Color('#00ff7f')
    ];
    const selectedColor = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
    
    colors.set([selectedColor.r, selectedColor.g, selectedColor.b], i * 3);
  }
  
  return { positions, colors };
};

const generateQuantumField = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const gridX = Math.floor((Math.random() - 0.5) * 20) * 15;
    const gridY = Math.floor((Math.random() - 0.5) * 20) * 15;
    const gridZ = Math.floor((Math.random() - 0.5) * 20) * 15;
    
    const x = gridX + Math.sin(i * 0.1) * 8;
    const y = gridY + Math.cos(i * 0.1) * 8;
    const z = gridZ + Math.sin(i * 0.05) * 8;
    
    positions.set([x, y, z], i * 3);
    const intensity = Math.random();
    const color = new THREE.Color().setHSL(0.6, 1, intensity * 0.8 + 0.2);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  
  return { positions, colors };
};

const generatePlanetPoints = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * spread;
    const y = (Math.random() - 0.5) * spread;
    const z = (Math.random() - 0.5) * spread;
    positions.set([x, y, z], i * 3);
    const planetType = Math.random();
    let color;
    let size;
    
    if (planetType < 0.15) {
      color = new THREE.Color('#8B4513');
      size = Math.random() * 2 + 0.5;
    } else if (planetType < 0.3) {
      color = new THREE.Color('#FF6B35');
      size = Math.random() * 2.5 + 1;
    } else if (planetType < 0.45) {
      color = new THREE.Color('#4A90E2'); 
      size = Math.random() * 3 + 1.5;
    } else if (planetType < 0.6) {
      color = new THREE.Color('#7ED321');
      size = Math.random() * 3.5 + 1;
    } else if (planetType < 0.7) {
      color = new THREE.Color('#F5A623');
      size = Math.random() * 2 + 1;
    } else if (planetType < 0.8) {
      color = new THREE.Color('#BD10E0');
      size = Math.random() * 5 + 2;
    } else if (planetType < 0.9) {
      color = new THREE.Color('#50E3C2');
      size = Math.random() * 2.5 + 1;
    } else {
      color = new THREE.Color('#FF9500');
      size = Math.random() * 4 + 1.5;
    }
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = size;
  }
  
  return { positions, colors, sizes };
};


const generateAsteroidBelt = (count: number, spread: number) => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = spread + (Math.random() - 0.5) * 20;
    
    const x = Math.cos(angle) * radius;
    const y = (Math.random() - 0.5) * 10;
    const z = Math.sin(angle) * radius;
    
    positions.set([x, y, z], i * 3);
    
    const grayness = Math.random() * 0.3 + 0.2;
    const color = new THREE.Color(grayness, grayness, grayness * 1.1);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = Math.random() * 0.8 + 0.2;
  }
  
  return { positions, colors, sizes };
};

const NebulaArt = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
  const nebulaRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => generateNebulaClouds(3000, 60 * scale), [scale]);
  
  useFrame((state) => {
    if (nebulaRef.current) {
      nebulaRef.current.rotation.y += 0.0002 * scale;
      nebulaRef.current.rotation.x += 0.0001 * scale;
    }
  });
  
  return (
    <points ref={nebulaRef} position={position} scale={scale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={2 * scale}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        blending={THREE.AdditiveBlending}
        opacity={0.6}
      />
    </points>
  );
};

const QuantumFieldArt = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
  const fieldRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => generateQuantumField(2000, 80 * scale), [scale]);
  
  useFrame((state) => {
    if (fieldRef.current) {
      fieldRef.current.rotation.x += 0.001 * scale;
      fieldRef.current.rotation.z += 0.0005 * scale;
    }
  });
  
  return (
    <points ref={fieldRef} position={position} scale={scale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1.5 * scale}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        blending={THREE.AdditiveBlending}
        opacity={0.7}
      />
    </points>
  );
};

const AsteroidBelt = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
  const beltRef = useRef<THREE.Points>(null);
  const { positions, colors, sizes } = useMemo(() => generateAsteroidBelt(1500, 80 * scale), [scale]);
  
  useFrame((state) => {
    if (beltRef.current) {
      beltRef.current.rotation.y += 0.0008 * scale;
    }
  });
  
  return (
    <points ref={beltRef} position={position} scale={scale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
          args={[colors, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          count={sizes.length}
          array={sizes}
          itemSize={1}
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        opacity={0.8}
      />
    </points>
    );
};

const SpiralGalaxy = ({ position }: { position: [number, number, number] }) => {
  const galaxyRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => generateGalaxyPoints(4000, 100), []);
  
  useFrame((state) => {
    if (galaxyRef.current) {
      galaxyRef.current.rotation.y -= 0.001;
    }
  });
  
  return (
    <points ref={galaxyRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.8}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const DetailedPlanets = () => {
  const planetsRef = useRef<THREE.Points>(null);
  const { positions, colors, sizes } = useMemo(() => generatePlanetPoints(2500, 400), []);
  
  useFrame((state) => {
    if (planetsRef.current) {
      planetsRef.current.rotation.y += 0.0003;
      planetsRef.current.rotation.x += 0.0001;
    }
  });
  
  return (
    <points ref={planetsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
          args={[colors, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          count={sizes.length}
          array={sizes}
          itemSize={1}
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1}
        sizeAttenuation
        depthWrite={false}
        transparent
        vertexColors
        opacity={0.9}
      />
      </points>
  );
};

const HeroSectionBG = () => {
  return (
    <Canvas
      camera={{ position: [0, 250, 0], fov: 70 }}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto' }}
    >
      <color attach="background" args={["#000011"]} />
      <fog attach="fog" args={["#000011", 200, 500]} />
      
      <Suspense fallback={null}>
        <ambientLight intensity={0.1} />
        <pointLight position={[100, 100, 100]} intensity={0.5} color="#ffffff" />
        <pointLight position={[-100, -100, -100]} intensity={0.3} color="#4488ff" />
        
        <Stars radius={500} depth={100} count={5000} factor={10} fade speed={0.3} />
        
        <SpiralGalaxy position={[0, 0, 0]} />
        
        <EllipticalGalaxy position={[-200, 50, -100]} scale={0.8} />
        <IrregularGalaxy position={[180, -40, -150]} scale={0.6} />
        <BarredGalaxy position={[100, 80, -200]} scale={0.7} />
        <EllipticalGalaxy position={[-150, -60, -180]} scale={0.5} />
        
        <NebulaArt position={[350, 100, -80]} scale={1.2} />
        <NebulaArt position={[-380, -50, -120]} scale={0.8} />
        <QuantumFieldArt position={[250, -120, 50]} scale={0.9} />
        <QuantumFieldArt position={[-300, 150, -50]} scale={1.1} />
        
        <AsteroidBelt position={[0, 0, 0]} scale={1.5} />
        <AsteroidBelt position={[200, 80, -100]} scale={0.7} />
        <DetailedPlanets />
        
        <OrbitControls 
          enableZoom={true} 
          autoRotate 
          autoRotateSpeed={0.15}
          minDistance={40}
          maxDistance={300}
          enablePan={true}
        />
      </Suspense>
    </Canvas>
  );
};

export default HeroSectionBG;