import { useEffect, useRef } from 'react';
import * as THREE from 'three';
// DİKKAT: Üstün zekanla bulduğun yöntemin eklentisi. Hata verirse sonundaki .js'yi silebilirsin
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { SubtitleTrack } from './types/app';

interface VirtualTheaterProps {
  videoElement: HTMLVideoElement | null;
  onClose: () => void;
  activeSubIndex: number;
  localSubs: SubtitleTrack[];
  currentTime: number;
  duration: number;
  subSettings: { color: string; size: string; bg: string };
  isVideoPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  formatTime: (time: number) => string;
  companionName?: string;
  t: { exitTheaterBtn: string; theaterLookAroundHint: string };
}

export default function VirtualTheater({
  videoElement, onClose, activeSubIndex, localSubs, currentTime, duration, subSettings,
  isVideoPlaying, onTogglePlay, onSeek, formatTime, companionName, t,
}: VirtualTheaterProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Fare hareketleri
  const drag = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0 });

  // İkinci koltuk (parti arkadaşı) için sahne referansları - ana kurulum efektinden bağımsız güncellenir
  const cssSceneRef = useRef<THREE.Scene | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const companionGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!mountRef.current || !videoElement) return;

    // VİDEONUN ORİJİNAL YERİNİ KAYDEDİYORUZ (Çıkarken yerine koymak için)
    const originalParent = videoElement.parentElement;
    const originalSibling = videoElement.nextSibling;
    const originalStyle = videoElement.getAttribute('style');

    // ==========================================
    // 1. SAHNE VE KAMERA
    // ==========================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020202);
    
    // CSS3D için ayrı bir sahne oluşturuyoruz (Senin sıkıştırma taktiği!)
    const cssScene = new THREE.Scene();

    sceneRef.current = scene;
    cssSceneRef.current = cssScene;

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 15); 
    camera.rotation.order = 'YXZ';

    // ==========================================
    // 2. ÇİFT RENDERER KURULUMU (WebGL + CSS3D)
    // ==========================================
    // A) WebGL Renderer (Koltuklar ve Oda için)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.zIndex = '1';
    mountRef.current.appendChild(renderer.domElement);

    // B) CSS3D Renderer (Video Player'ı sıkıştırmak için)
    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = '0px';
    cssRenderer.domElement.style.zIndex = '2'; // WebGL'in üstüne koyuyoruz
    cssRenderer.domElement.style.pointerEvents = 'none'; // Fareyi yutmasını engelliyoruz
    mountRef.current.appendChild(cssRenderer.domElement);

    // ==========================================
    // 3. VIP SİNEMA TASARIMI (WebGL Kısmı)
    // ==========================================
    const roomMat = new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.BackSide, roughness: 1.0 });
    const room = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 80), roomMat);
    room.position.set(0, 5, 0);
    scene.add(room);

    const stepMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 10), stepMat);
      step.position.set(0, -9 + (i * 1.5), -5 + (i * 10)); 
      scene.add(step);
      
      const stepNeon = new THREE.Mesh(new THREE.BoxGeometry(60, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
      stepNeon.position.set(0, -8 + (i * 1.5), -10 + (i * 10));
      scene.add(stepNeon);
    }

    const seatMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.3, metalness: 0.2 }); 
    for (let row = 0; row < 6; row++) {
      let yPos = -7.9 + (row * 1.5);
      let zPos = -3 + (row * 10);
      for (let x = -20; x <= 20; x += 3.5) {
        if (x > -3 && x < 3 && row === 2) continue; 
        const seatBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.5), seatMat);
        seatBase.position.set(x, yPos, zPos);
        scene.add(seatBase);
        const seatBack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.5, 0.6), seatMat);
        seatBack.position.set(x, yPos + 1.2, zPos + 1);
        seatBack.rotation.x = -0.1;
        scene.add(seatBack);
      }
    }

    const frame = new THREE.Mesh(new THREE.BoxGeometry(33, 19, 0.5), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    frame.position.set(0, 4, -34.5);
    scene.add(frame);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3)); 
    const screenLight = new THREE.PointLight(0xffffff, 150, 60); 
    screenLight.position.set(0, 5, -25);
    scene.add(screenLight);

// ==========================================
    // 4. PLAYER'I PERDEYE SIKIŞTIRMA (Siyah Kare Düzeltmesi)
    // ==========================================
    const videoContainer = document.createElement('div');
    videoContainer.style.width = '1920px';
    videoContainer.style.height = '1080px';
    videoContainer.style.backgroundColor = 'transparent'; // <-- SİYAH KAREYİ YOK EDEN KISIM

    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'contain';
    videoElement.style.background = 'transparent'; // <-- VİDEO ARKASI ŞEFFAF
    videoElement.style.pointerEvents = 'none'; 
    videoContainer.appendChild(videoElement);

    const cssObject = new CSS3DObject(videoContainer);
    cssObject.scale.set(32 / 1920, 18 / 1080, 1);
    cssObject.position.set(0, 4, -34); 
    
    cssScene.add(cssObject);

    // ==========================================
    // 5. RENDER DÖNGÜSÜ
    // ==========================================
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      camera.rotation.set(drag.current.pitch, drag.current.yaw, 0, 'YXZ');
      
      // Hem odayı hem de içindeki HTML player'ı renderla!
      renderer.render(scene, camera);
      cssRenderer.render(cssScene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      cssRenderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);

      sceneRef.current = null;
      cssSceneRef.current = null;
      companionGroupRef.current = null;

      if (mountRef.current) {
        if (renderer.domElement.parentNode) mountRef.current.removeChild(renderer.domElement);
        if (cssRenderer.domElement.parentNode) mountRef.current.removeChild(cssRenderer.domElement);
      }
      
      renderer.dispose();
      
      // ÇOK KRİTİK: Çıkarken videoyuReact uygulamasına geri veriyoruz ki arayüz bozulmasın
      if (originalParent) {
        originalParent.insertBefore(videoElement, originalSibling);
      }
      if (originalStyle !== null) {
        videoElement.setAttribute('style', originalStyle);
      } else {
        videoElement.removeAttribute('style');
      }
    };
  }, [videoElement]);

  // ==========================================
  // 5.5 PARTİ ARKADAŞI KOLTUĞU (yan yana oturma)
  // ==========================================
  useEffect(() => {
    const scene = sceneRef.current;
    const cssScene = cssSceneRef.current;
    if (!scene || !cssScene) return;

    if (!companionName) {
      if (companionGroupRef.current) {
        scene.remove(companionGroupRef.current);
        cssScene.remove(companionGroupRef.current.userData.label);
        companionGroupRef.current = null;
      }
      return;
    }

    if (companionGroupRef.current) return; // zaten oturuyor

    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 4, 8), bodyMat);
    body.position.set(3.5, 0.4, 15);
    group.add(body);

    const labelDiv = document.createElement('div');
    labelDiv.textContent = `🎬 ${companionName}`;
    labelDiv.style.padding = '6px 16px';
    labelDiv.style.background = 'rgba(0,0,0,0.75)';
    labelDiv.style.border = '1px solid rgba(139,92,246,0.6)';
    labelDiv.style.borderRadius = '9999px';
    labelDiv.style.color = 'white';
    labelDiv.style.fontFamily = 'sans-serif';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.fontSize = '28px';
    labelDiv.style.whiteSpace = 'nowrap';

    const label = new CSS3DObject(labelDiv);
    label.scale.set(0.01, 0.01, 1);
    label.position.set(3.5, 1.9, 15);
    group.userData.label = label;

    scene.add(group);
    cssScene.add(label);
    companionGroupRef.current = group;

    return () => {
      scene.remove(group);
      cssScene.remove(label);
      if (companionGroupRef.current === group) companionGroupRef.current = null;
    };
  }, [companionName]);

  // ==========================================
  // 6. BİZE ÖZEL KONTROLCÜ
  // ==========================================
  const onDown = (e: React.PointerEvent) => {
    drag.current.active = true;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;

    drag.current.yaw -= dx * 0.003;
    drag.current.pitch -= dy * 0.003;
    drag.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, drag.current.pitch));
  };
  
  const onUp = (e: React.PointerEvent) => {
    drag.current.active = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      
      {/* 1. KATMAN: 3D MOTORU & VİDEO OYNATICI (Fareyi hissetmez) */}
      <div ref={mountRef} className="absolute inset-0 pointer-events-none" />

      {/* 2. KATMAN: FARE YAKALAYICI */}
      <div 
        className="absolute inset-0 z-[10000] cursor-move"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />

      {/* 3. KATMAN: KULLANICI ARAYÜZÜ VE BUTONLAR */}
      <div className="absolute inset-0 z-[10001] pointer-events-none">
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-8 left-8 bg-zinc-900/80 border border-zinc-700 text-white px-6 py-2 rounded-full font-bold hover:bg-red-600 transition shadow-2xl pointer-events-auto cursor-pointer"
        >
          {t.exitTheaterBtn}
        </button>
        <div className="absolute bottom-8 right-8 text-zinc-500 text-xs font-mono bg-black/50 p-2 rounded pointer-events-none">
          {t.theaterLookAroundHint}
        </div>

        {/* ALTYAZI OVERLAY */}
        {activeSubIndex >= 0 && localSubs[activeSubIndex] && (
          <div className="absolute left-0 right-0 bottom-28 flex flex-col items-center justify-end pointer-events-none">
            {localSubs[activeSubIndex].cues
              .filter(c => currentTime >= c.start && currentTime <= c.end)
              .map((c, i) => (
                <div key={i} className="text-center mb-1">
                  {c.text.split('\n').map((line, j) => (
                    <span
                      key={j}
                      className={`inline-block font-bold leading-tight ${subSettings.color}`}
                      style={{
                        fontSize: subSettings.size,
                        textShadow: subSettings.bg === 'text-shadow' ? '0px 0px 6px black, 0px 0px 12px black' : 'none',
                        backgroundColor: subSettings.bg === 'solid' ? 'rgba(0,0,0,0.8)' : 'transparent',
                        padding: subSettings.bg === 'solid' ? '2px 10px' : '0',
                        borderRadius: subSettings.bg === 'solid' ? '8px' : '0',
                      }}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              ))}
          </div>
        )}

        {/* OYNATIM KONTROLLERİ */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 border border-zinc-700 rounded-full px-6 py-3 pointer-events-auto backdrop-blur">
          <button onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} className="text-2xl text-white hover:scale-110 transition">
            {isVideoPlaying ? "⏸" : "▶"}
          </button>
          <span className="text-xs text-zinc-300 font-mono w-12 text-right">{formatTime(currentTime)}</span>
          <div
            className="w-64 h-1.5 bg-zinc-700 rounded-full cursor-pointer relative"
            onClick={(e) => {
              e.stopPropagation();
              if (!duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(pct * duration);
            }}
          >
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-zinc-300 font-mono w-12">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}