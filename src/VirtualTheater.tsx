import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
  theme?: 'vip' | 'space' | 'retro'; 
  t: { exitTheaterBtn: string; theaterLookAroundHint: string };
}

export default function VirtualTheater({
  videoElement, onClose, activeSubIndex, localSubs, currentTime, duration, subSettings,
  isVideoPlaying, onTogglePlay, onSeek, formatTime, companionName, theme = 'vip', t,
}: VirtualTheaterProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0 });

  const cssSceneRef = useRef<THREE.Scene | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const companionGroupRef = useRef<THREE.Group | null>(null);

  // YENİ: Ambiyans Sesleri State'i
  const [ambiance, setAmbiance] = useState<'none' | 'rain' | 'fire' | 'projector'>('none');
  const audioRef = useRef<HTMLAudioElement>(null);

  const getThemeColors = () => {
    switch (theme) {
      case 'space': return { bg: 0x000000, ambient: 0x111122, neon: 0x0055ff, light: 0xffffff };
      case 'retro': return { bg: 0x1a0f14, ambient: 0x221111, neon: 0xff00ff, light: 0xffddaa };
      case 'vip':
      default: return { bg: 0x020202, ambient: 0xffffff, neon: 0xff0000, light: 0xffffff };
    }
  };

  // YENİ: Ambiyans Sesi Çalar
  useEffect(() => {
    if (!audioRef.current) return;
    if (ambiance === 'none') {
      audioRef.current.pause();
    } else {
      let src = "";
      if (ambiance === 'rain') src = "https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1139c.mp3";
      if (ambiance === 'fire') src = "https://cdn.pixabay.com/download/audio/2022/02/23/audio_d1718ab41b.mp3";
      if (ambiance === 'projector') src = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_73142721ab.mp3";
      audioRef.current.src = src;
      audioRef.current.volume = 0.2; // Filmin sesini bastırmasın diye kısık
      audioRef.current.play().catch(()=>{});
    }
  }, [ambiance]);

  useEffect(() => {
    if (!mountRef.current || !videoElement) return;

    const originalParent = videoElement.parentElement;
    const originalSibling = videoElement.nextSibling;
    const originalStyle = videoElement.getAttribute('style');
    const isYouTube = videoElement.src.includes('youtube.com') || (videoElement.id && videoElement.id.includes('youtube'));
    const colors = getThemeColors();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.bg);
    if (theme === 'space') {
      scene.fog = new THREE.FogExp2(0x000000, 0.005);
      const starsGeo = new THREE.BufferGeometry();
      const posArray = new Float32Array(2000 * 3);
      for(let i = 0; i < 2000 * 3; i++) posArray[i] = (Math.random() - 0.5) * 200;
      starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.1})));
    } else {
      scene.fog = new THREE.FogExp2(colors.bg, 0.015);
    }
    
    const cssScene = new THREE.Scene();
    sceneRef.current = scene;
    cssSceneRef.current = cssScene;

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 15); 
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.zIndex = '1';
    mountRef.current.appendChild(renderer.domElement);

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = '0px';
    cssRenderer.domElement.style.zIndex = '2'; 
    cssRenderer.domElement.style.pointerEvents = 'none'; 
    mountRef.current.appendChild(cssRenderer.domElement);

    if (theme !== 'space') {
      const roomGeo = new THREE.BoxGeometry(60, 30, 80);
      const roomMat = new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.BackSide, roughness: 1.0 });
      const room = new THREE.Mesh(roomGeo, roomMat);
      room.position.set(0, 5, 0);
      scene.add(room);
    }

    const stepMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
    const neonMat = new THREE.MeshBasicMaterial({ color: colors.neon });

    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 10), stepMat);
      step.position.set(0, -9 + (i * 1.5), -5 + (i * 10)); 
      scene.add(step);
      const stepNeon = new THREE.Mesh(new THREE.BoxGeometry(60, 0.05, 0.1), neonMat);
      stepNeon.position.set(0, -8 + (i * 1.5), -10 + (i * 10));
      scene.add(stepNeon);
    }

    const seatMat = new THREE.MeshStandardMaterial({ color: theme === 'retro' ? 0x882222 : 0x080808, roughness: 0.3, metalness: 0.2 }); 
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

    scene.add(new THREE.AmbientLight(colors.ambient, theme === 'space' ? 0.8 : 0.3)); 
    const screenLight = new THREE.PointLight(colors.light, 150, 60); 
    screenLight.position.set(0, 5, -25);
    scene.add(screenLight);

    let videoTexture: THREE.VideoTexture | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    if (!isYouTube) {
      videoTexture = new THREE.VideoTexture(videoElement);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      const screenMat = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), screenMat);
      screen.position.set(0, 4, -34); 
      scene.add(screen);
      videoElement.style.opacity = '0.01';

      // Setup Canvas for Ambilight
      canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } else {
      const videoContainer = document.createElement('div');
      videoContainer.style.width = '1920px';
      videoContainer.style.height = '1080px';
      videoContainer.style.backgroundColor = '#000';
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.pointerEvents = 'none'; 
      videoContainer.appendChild(videoElement);
      const cssObject = new CSS3DObject(videoContainer);
      cssObject.scale.set(32 / 1920, 18 / 1080, 1);
      cssObject.position.set(0, 4, -34); 
      cssScene.add(cssObject);
    }

    let animationId: number;
    let lastLightUpdate = 0;
    
    const animate = (time: number) => {
      animationId = requestAnimationFrame(animate);
      camera.rotation.set(drag.current.pitch, drag.current.yaw, 0, 'YXZ');
      renderer.render(scene, camera);
      if (isYouTube) cssRenderer.render(cssScene, camera);

      // Ambilight effect (update 10 times a second)
      if (!isYouTube && ctx && canvas && time - lastLightUpdate > 100) {
        lastLightUpdate = time;
        try {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < data.length; i += 16) {
            r += data[i]; g += data[i+1]; b += data[i+2];
          }
          const count = data.length / 16;
          const targetColor = new THREE.Color(`rgb(${Math.floor(r/count)}, ${Math.floor(g/count)}, ${Math.floor(b/count)})`);
          screenLight.color.lerp(targetColor, 0.1);
        } catch (e) {}
      }
    };
    requestAnimationFrame(animate);

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
      if (videoTexture) videoTexture.dispose();
      
      if (originalParent) originalParent.insertBefore(videoElement, originalSibling);
      if (originalStyle !== null) videoElement.setAttribute('style', originalStyle);
      else videoElement.removeAttribute('style');
    };
  }, [videoElement, theme]);

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

    if (companionGroupRef.current) return; 

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
  }, [companionName, theme]);

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
      <audio ref={audioRef} loop />
      <div ref={mountRef} className="absolute inset-0 pointer-events-none" />
      <div className="absolute inset-0 z-[10000] cursor-move" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      <div className="absolute inset-0 z-[10001] pointer-events-none">
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-8 left-8 bg-zinc-900/80 border border-zinc-700 text-white px-6 py-2 rounded-full font-bold hover:bg-red-600 transition shadow-2xl pointer-events-auto cursor-pointer">
          {t.exitTheaterBtn}
        </button>
        <div className="absolute bottom-8 right-8 text-zinc-500 text-xs font-mono bg-black/50 p-2 rounded pointer-events-none">
          {t.theaterLookAroundHint}
        </div>

        {activeSubIndex >= 0 && localSubs[activeSubIndex] && (
          <div className="absolute left-0 right-0 bottom-28 flex flex-col items-center justify-end pointer-events-none">
            {localSubs[activeSubIndex].cues
              .filter(c => currentTime >= c.start && currentTime <= c.end)
              .map((c, i) => (
                <div key={i} className="text-center mb-1">
                  {c.text.split('\n').map((line, j) => (
                    <span key={j} className={`inline-block font-bold leading-tight ${subSettings.color}`} style={{ fontSize: subSettings.size, textShadow: subSettings.bg === 'text-shadow' ? '0px 0px 6px black, 0px 0px 12px black' : 'none', backgroundColor: subSettings.bg === 'solid' ? 'rgba(0,0,0,0.8)' : 'transparent', padding: subSettings.bg === 'solid' ? '2px 10px' : '0', borderRadius: subSettings.bg === 'solid' ? '8px' : '0' }}>
                      {line}
                    </span>
                  ))}
                </div>
              ))}
          </div>
        )}

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 border border-zinc-700 rounded-full px-6 py-3 pointer-events-auto backdrop-blur">
          <button onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} className="text-2xl text-white hover:scale-110 transition">
            {isVideoPlaying ? "⏸" : "▶"}
          </button>
          <span className="text-xs text-zinc-300 font-mono w-12 text-right">{formatTime(currentTime)}</span>
          <div className="w-64 h-1.5 bg-zinc-700 rounded-full cursor-pointer relative" onClick={(e) => { e.stopPropagation(); if (!duration) return; const rect = e.currentTarget.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); onSeek(pct * duration); }}>
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-zinc-300 font-mono w-12">{formatTime(duration)}</span>
          
          {/* YENİ: AMBİYANS SEÇİCİ */}
          <select 
             value={ambiance}
             onChange={(e: any) => setAmbiance(e.target.value)}
             className="bg-black/50 border border-zinc-500 rounded px-2 py-1 ml-2 text-xs font-bold outline-none hover:border-white transition"
           >
             <option value="none">Ambiyans: Kapalı</option>
             <option value="rain">🌧️ Yağmur</option>
             <option value="fire">🔥 Şömine</option>
             <option value="projector">📽️ Projeksiyon</option>
           </select>
        </div>
      </div>
    </div>
  );
}