import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
interface VirtualTheaterProps {
  videoElement: HTMLVideoElement | null;
  onClose: () => void;
}

export default function VirtualTheater({ videoElement, onClose }: VirtualTheaterProps) {
  const mountRef = useRef<HTMLDivElement>(null);

useEffect(() => {
    if (!mountRef.current || !videoElement) return;

    // 1. SAHNE VE KAMERA
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Zifiri karanlık yerine çok koyu gri

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5); 

    // 2. RENDERER
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Yeni Three.js sürümlerinde renklerin doğru çıkması için:
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    mountRef.current.appendChild(renderer.domElement);

    // 3. PROSEDÜREL ODA
    const roomGeo = new THREE.BoxGeometry(40, 20, 40);
    const roomMat = new THREE.MeshStandardMaterial({ 
      color: 0x222222, // Duvarları biraz daha aydınlık yaptık ki odayı görebilelim
      side: THREE.BackSide, 
      roughness: 0.8 
    });
    const room = new THREE.Mesh(roomGeo, roomMat);
    scene.add(room);

// 4. SİNEMA PERDESİ (VideoTexture)
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBAFormat;
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.generateMipmaps = false; // <--- SİYAH EKRANIN EN BÜYÜK DÜŞMANINI KAPATTIK!

    const screenGeo = new THREE.PlaneGeometry(16, 9);
    // basic material'a ufak bir parlaklık ayarı çekiyoruz
    const screenMat = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 2, -19.9);
    scene.add(screen);

    // 5. IŞIKLANDIRMA (HAYAT KURTARAN KISIM)
    // Odayı tamamen aydınlatacak genel loş ışık (Bunu eklemezsek her şey siyah görünebilir)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); 
    scene.add(ambientLight);

    const screenLight = new THREE.PointLight(0xffffff, 200, 30); // Işık şiddetini artırdık
    screenLight.position.set(0, 2, -18);
    scene.add(screenLight);

    const floorLight = new THREE.PointLight(0xff0000, 100, 15); 
    floorLight.position.set(0, -9, 0);
    scene.add(floorLight);

    // 6. KAMERA KONTROLLERİ
    let controls: any;
    try {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = true;
      controls.enablePan = false;
      controls.maxPolarAngle = Math.PI / 2 + 0.1;
    } catch (e) {
      console.error("OrbitControls yüklenemedi!", e);
    }

// 7. RENDER DÖNGÜSÜ
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if(controls) controls.update();
      
      // TARAYICI UYANIKLIĞINI ENGELLİYORUZ: Video oynuyorsa pikselleri zorla al!
      if (videoElement && videoElement.readyState >= 2) {
         videoTexture.needsUpdate = true;
      }
      
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement);
      renderer.dispose();
      videoTexture.dispose();
    };
  }, [videoElement]);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <div ref={mountRef} className="absolute inset-0 cursor-move" />
      
      {/* Sanal Gerçeklikten Çıkış Butonu */}
      <button 
        onClick={onClose}
        className="absolute top-8 left-8 z-[210] bg-zinc-900/80 border border-zinc-700 text-white px-6 py-2 rounded-full font-bold hover:bg-red-600 transition backdrop-blur"
      >
        🚪 Salondan Çık
      </button>
      
      <div className="absolute bottom-8 right-8 z-[210] text-zinc-500 text-xs font-mono bg-black/50 p-2 rounded">
        Etrafına bakmak için sürükle • Yakınlaşmak için scroll
      </div>
    </div>
  );
}