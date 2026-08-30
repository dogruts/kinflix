import { useEffect, useState, RefObject } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getSetting } from "../database";
import * as faceapi from '@vladmandic/face-api';

export default function XRayOverlay({ 
  videoRef, tmdbId, title, year, isPaused 
}: { 
  videoRef: RefObject<HTMLVideoElement | null>, tmdbId: number | null, title?: string, year?: number | null, isPaused: boolean 
}) {
  const [cast, setCast] = useState<any[]>([]);
  const [isForced, setIsForced] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState<faceapi.FaceMatcher | null>(null);
  const [matchedActors, setMatchedActors] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Global butonu dinle
  useEffect(() => {
    const handleEvent = (e: any) => { if (e.detail?.action === "toggle_xray") setIsForced(prev => !prev); };
    window.addEventListener('kinflix_party_event', handleEvent);
    return () => window.removeEventListener('kinflix_party_event', handleEvent);
  }, []);

  // 1. Modelleri Yükle
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        setModelsLoaded(true);
        console.log("Face-API modelleri yüklendi!");
      } catch (e) {
        console.warn("Face-API modelleri yüklenemedi:", e);
      }
    };
    loadModels();
  }, []);

  // 2. TMDB Cast Çek ve Eğit (Aşama 1)
  useEffect(() => {
    if ((!tmdbId && !title) || !modelsLoaded) return;

    let isMounted = true;
    
    const loadAndTrain = async () => {
      try {
        let token = await getSetting("tmdb_token");
        if (!token) token = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjZmJmZmQyMmRiNDlkMWZjN2UxODg4YzhiMjA2YzM2MCIsIm5iZiI6MTc4NzgxODk0Ni44MDQsInN1YiI6IjZhOGZmM2MyMzM0NDdkNTEyNjMwNTJkZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.vhkano8PDFbETkVhPNHqJpqx8X4o1tTAK5N6pKKPnbA";
        
        const isWeb = typeof window !== 'undefined' && !('__TAURI__' in window);
        const fetchMethod = isWeb ? window.fetch : tauriFetch;
        
        let finalTmdbId = tmdbId;
        
        // TMDB ID yoksa isimden bul
        if (!finalTmdbId && title) {
           const cleanTitle = title.replace(/\b(1080p|720p|480p|2160p|4k|bluray|x264|x265|hevc|dual|remux|webrip|hdrip|hdtv|yify|yts)\b.*/i, '').replace(/(\[.*?\]|\(.*?\))/g, '').replace(/[-_.]/g, ' ').trim();
           const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}${year ? `&primary_release_year=${year}` : ''}`;
           const sRes = await fetchMethod(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
           const sData = await sRes.json();
           if (sData && sData.results && sData.results.length > 0) finalTmdbId = sData.results[0].id;
        }

        if (!finalTmdbId) return;

        const res = await fetchMethod(`https://api.themoviedb.org/3/movie/${finalTmdbId}/credits`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        
        if (data && data.cast) {
          const topCast = data.cast.filter((c: any) => c.profile_path).slice(0, 10);
          if (!isMounted) return;
          setCast(topCast);

          // Aktör yüzlerini öğren (Descriptors) - Performans için gecikmeli başlat
          setTimeout(async () => {
            const labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];
            
            for (const actor of topCast) {
              if (!isMounted) break;
              try {
                // UI'ın donmasını engellemek için her aktör arasında 300ms bekle (Thread'i serbest bırak)
                await new Promise(r => setTimeout(r, 300));
                
                const imgUrl = `https://image.tmdb.org/t/p/w185${actor.profile_path}`;
                const img = await faceapi.fetchImage(imgUrl);
                const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                
                if (detection) {
                  labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(actor.name, [detection.descriptor]));
                }
              } catch (err) {
                console.warn("Aktör yüzü analiz edilemedi:", actor.name);
              }
            }
            
            if (labeledDescriptors.length > 0 && isMounted) {
              setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.6));
              console.log("X-Ray: Yüz eşleştirici hazır!");
            }
          }, 3000); // Film açıldıktan 3 saniye sonra başla ki ilk açılış kasmasın
        }
      } catch (e) {
        console.warn("X-Ray Hatası:", e);
      }
    };
    loadAndTrain();
    
    return () => { isMounted = false; };
  }, [tmdbId, title, year, modelsLoaded]);

  // 3. Sahnede Bulma (Aşama 2)
  useEffect(() => {
    const shouldShow = isPaused || isForced;
    if (!shouldShow || !videoRef.current || !faceMatcher) return;

    let isMounted = true;
    const analyzeFrame = async () => {
      setIsAnalyzing(true);
      try {
        const video = videoRef.current;
        if (!video) return;

        // Video karesini (frame) al
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Ekrandaki tüm yüzleri bul
        const detections = await faceapi.detectAllFaces(canvas).withFaceLandmarks().withFaceDescriptors();
        
        const foundActors: string[] = [];
        detections.forEach(d => {
          const match = faceMatcher.findBestMatch(d.descriptor);
          if (match.label !== 'unknown') {
            foundActors.push(match.label);
          }
        });
        
        if (isMounted) {
          setMatchedActors(foundActors);
          setIsAnalyzing(false);
        }
      } catch (err) {
        console.warn("Kare analizi hatası:", err);
        if (isMounted) setIsAnalyzing(false);
      }
    };

    analyzeFrame();

    return () => { isMounted = false; };
  }, [isPaused, isForced, faceMatcher, videoRef]);

  if ((!isPaused && !isForced) || cast.length === 0) return null;

  // Eşleşen aktörleri başa al, diğerlerini soluk göster
  const displayCast = cast.map(c => ({
    ...c,
    isOnScreen: matchedActors.includes(c.name)
  }));
  
  // Sıralama: Ekrandakiler en üstte
  displayCast.sort((a, b) => (a.isOnScreen === b.isOnScreen) ? 0 : a.isOnScreen ? -1 : 1);

  return (
    <div className="absolute top-1/4 left-8 z-[100] flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-500 bg-black/80 p-5 rounded-2xl backdrop-blur-md border border-zinc-700/50 shadow-[0_10px_50px_rgba(0,0,0,0.8)]">
      <h3 className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
        <span>🤖</span> Kinflix True X-Ray
        {isAnalyzing && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse ml-2" title="Ekran analiz ediliyor..."></span>}
      </h3>
      
      {displayCast.slice(0, 5).map(c => (
         <div key={c.id} className={`flex items-center gap-4 group cursor-pointer transition-all duration-300 ${c.isOnScreen ? 'opacity-100 scale-105' : 'opacity-30 grayscale hover:opacity-100 hover:grayscale-0'}`} onClick={(e) => { e.stopPropagation(); window.open(`https://www.themoviedb.org/person/${c.id}`, '_blank'); }}>
            <div className="relative">
              <img 
                src={`https://image.tmdb.org/t/p/w185${c.profile_path}`} 
                className={`w-14 h-14 rounded-full object-cover border-2 transition-all shadow-lg ${c.isOnScreen ? 'border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.4)]' : 'border-transparent group-hover:border-zinc-500'}`}
                alt={c.name}
              />
              {c.isOnScreen && (
                <div className="absolute -bottom-1 -right-1 bg-green-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-black">
                  MATCH
                </div>
              )}
            </div>
            <div>
               <p className={`font-bold text-sm transition ${c.isOnScreen ? 'text-green-400' : 'text-white group-hover:text-zinc-300'}`}>{c.name}</p>
               <p className="text-zinc-400 text-xs line-clamp-1 max-w-[140px] italic">{c.character}</p>
            </div>
         </div>
      ))}
      
      {matchedActors.length === 0 && !isAnalyzing && (
        <div className="mt-2 text-[10px] text-zinc-500 text-center italic border-t border-zinc-800 pt-3">
          Sahnede bilinen yüz bulunamadı.
        </div>
      )}
    </div>
  );
}
