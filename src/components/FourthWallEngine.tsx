import { useEffect } from 'react';

export default function FourthWallEngine({
  isActive,
  genre,
  isPlaying
}: {
  isActive: boolean;
  genre: string;
  isPlaying: boolean;
}) {
  useEffect(() => {
    if (!isActive || !isPlaying) return;

    let intervalId: ReturnType<typeof setInterval>;
    let timeoutId: ReturnType<typeof setTimeout>;

    const g = genre.toLowerCase();

    if (g.includes("sci-fi") || g.includes("hacker") || g.includes("action") || g.includes("bilim kurgu")) {
      // MATRIX GLITCH EFEKTİ
      intervalId = setInterval(() => {
        if (Math.random() < 0.1) { // %10 ihtimalle UI bozulur
          const appDiv = document.getElementById("kinflix-app-root");
          if (appDiv) {
            appDiv.style.filter = "hue-rotate(90deg) contrast(150%)";
            appDiv.style.transform = "skewX(2deg) translateX(5px)";
            
            timeoutId = setTimeout(() => {
              appDiv.style.filter = "none";
              appDiv.style.transform = "none";
            }, 150);
          }
        }
      }, 10000);
    } else if (g.includes("horror") || g.includes("korku") || g.includes("thriller") || g.includes("gerilim")) {
      // KORKU EFEKTİ
      intervalId = setInterval(() => {
        if (Math.random() < 0.05) { // %5 ihtimalle
          const overlay = document.createElement("div");
          overlay.style.position = "fixed";
          overlay.style.inset = "0";
          overlay.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
          overlay.style.zIndex = "999999";
          overlay.style.pointerEvents = "none";
          overlay.style.boxShadow = "inset 0 0 100px rgba(255,0,0,0.5)";
          document.body.appendChild(overlay);
          
          timeoutId = setTimeout(() => {
            overlay.remove();
          }, 300);
        }
      }, 15000);
    }

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      const appDiv = document.getElementById("kinflix-app-root");
      if (appDiv) {
        appDiv.style.filter = "none";
        appDiv.style.transform = "none";
      }
    };
  }, [isActive, genre, isPlaying]);

  return null;
}

