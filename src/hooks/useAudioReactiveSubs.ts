import { useEffect, useRef, useState, RefObject } from 'react';

export function useAudioReactiveSubs(videoRef: RefObject<HTMLVideoElement | null>, isActive: boolean) {
  const [audioScale, setAudioScale] = useState(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !videoRef.current) {
      setAudioScale(1);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    try {
      // AudioContext'i sadece bir kez oluştur ve bağla
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;

        // Medya elementini bağla
        sourceRef.current = audioContextRef.current.createMediaElementSource(videoRef.current);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
      }

      // Context durdurulmuşsa başlat (Browser politikaları gereği tıklama ile)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);

      const renderLoop = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Bas frekanslarını analiz et (ilk 10 bar)
        let bassSum = 0;
        for (let i = 0; i < 10; i++) {
          bassSum += dataArray[i];
        }
        
        // Ortalama bas yoğunluğu (0 ile 255 arası)
        const bassAvg = bassSum / 10;
        
        // 1 ile 1.5 arası bir ölçek oluştur
        // Eğer çok sessizse 1 kalır, patlama veya beat varsa 1.3 - 1.5'e kadar zıplar
        const scale = 1 + (Math.max(0, bassAvg - 100) / 155) * 0.4;
        
        setAudioScale(scale);
        
        animationFrameRef.current = requestAnimationFrame(renderLoop);
      };

      renderLoop();

    } catch (err) {
      console.warn("Audio-Reactive Subtitles başlatılamadı:", err);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isActive, videoRef]);

  return audioScale;
}

