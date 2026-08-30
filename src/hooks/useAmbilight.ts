import { useEffect, useState, RefObject } from "react";

export function useAmbilight(videoRef: RefObject<HTMLVideoElement | null>, isPlaying: boolean, enabled: boolean) {
  const [color, setColor] = useState("rgba(0,0,0,0)");

  useEffect(() => {
    if (!enabled || !isPlaying || !videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 64; // Düşük çözünürlük ile CPU tasarrufu
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let intervalId: any;

    const extractColor = () => {
      if (video.paused || video.ended) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0;
        // Sadece kenar ve orta pikselleri örnekleyerek baskın rengi bul (basit ortalama)
        let step = 4 * 10; // Her 10 pikselde bir atla
        let count = 0;
        for (let i = 0; i < imageData.length; i += step) {
          r += imageData[i];
          g += imageData[i + 1];
          b += imageData[i + 2];
          count++;
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        
        // Parlaklığı biraz artır ki glow etkisi güzel görünsün
        setColor(`rgba(${r}, ${g}, ${b}, 0.8)`);
      } catch (e) {
        // CORS hatası alırsak sessizce geç
      }
    };

    // Saniyede 2 kez (500ms) rengi güncelle
    intervalId = setInterval(extractColor, 500);

    return () => clearInterval(intervalId);
  }, [videoRef, isPlaying, enabled]);

  return color;
}

