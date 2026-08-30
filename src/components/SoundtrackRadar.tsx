import { useState, useEffect } from 'react';

export default function SoundtrackRadar({
  isOpen,
  onClose,
  movieTitle
}: {
  isOpen: boolean;
  onClose: () => void;
  movieTitle?: string;
}) {
  const [step, setStep] = useState<"idle" | "listening" | "found">("idle");
  const [song, setSong] = useState<{ title: string, artist: string, url: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep("listening");
      // MOCK SHAZAM ALGORİTMASI
      // Gerçek bir Shazam API'si için RapidAPI / ACRCloud key gerekir. 
      // Şimdilik Kinflix'in büyüsünü yaşatmak için TMDB adı üzerinden Spotify araması simüle ediyoruz.
      setTimeout(() => {
        setSong({
          title: `${movieTitle || 'Film'} Original Soundtrack`,
          artist: "Various Artists",
          url: `https://open.spotify.com/search/${encodeURIComponent(movieTitle || 'Movie Soundtrack')}`
        });
        setStep("found");
      }, 3500);
    } else {
      setStep("idle");
      setSong(null);
    }
  }, [isOpen, movieTitle]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-20 right-8 z-[200] w-72 bg-zinc-900/90 border border-zinc-700/50 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden animate-in slide-in-from-right-4 duration-300">
      <div className="bg-gradient-to-r from-emerald-900/50 to-zinc-900 p-4 border-b border-zinc-800 flex justify-between items-center">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span className="text-emerald-500">🎵</span> Soundtrack Radar
        </h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition">✖</button>
      </div>

      <div className="p-6 flex flex-col items-center justify-center min-h-[160px]">
        {step === "listening" && (
          <div className="flex flex-col items-center gap-4">
             {/* Ses Dalgası Animasyonu */}
             <div className="flex items-end gap-1 h-12">
                <div className="w-1.5 bg-emerald-500 rounded-t-sm animate-[bounce_1s_infinite]"></div>
                <div className="w-1.5 bg-emerald-500 rounded-t-sm animate-[bounce_1.2s_infinite]"></div>
                <div className="w-1.5 bg-emerald-500 rounded-t-sm animate-[bounce_0.8s_infinite]"></div>
                <div className="w-1.5 bg-emerald-500 rounded-t-sm animate-[bounce_1.5s_infinite]"></div>
                <div className="w-1.5 bg-emerald-500 rounded-t-sm animate-[bounce_1.1s_infinite]"></div>
             </div>
             <p className="text-sm text-zinc-400 font-medium animate-pulse">Sesi dinliyor...</p>
          </div>
        )}

        {step === "found" && song && (
          <div className="flex flex-col items-center w-full animate-in zoom-in-95">
             <div className="w-16 h-16 bg-zinc-800 rounded-xl mb-3 shadow-lg flex items-center justify-center text-3xl">
               💿
             </div>
             <p className="font-bold text-white text-center text-lg leading-tight">{song.title}</p>
             <p className="text-sm text-zinc-400 mb-5">{song.artist}</p>
             
             <button 
               onClick={() => window.open(song.url, '_blank')}
               className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold py-2 rounded-full transition flex items-center justify-center gap-2"
             >
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.467-.077-.334.132-.67.467-.745 3.808-.87 7.076-.496 9.715 1.115.293.18.386.563.207.853zm1.2-3.15c-.225.367-.704.482-1.07.257-2.685-1.65-6.785-2.13-9.965-1.165-.413.127-.852-.107-.978-.52-.127-.413.107-.852.52-.978 3.66-1.11 8.35-.575 11.432 1.32.366.226.48.704.256 1.086zm.12-3.26C14.73 8.16 8.52 7.95 4.96 9.03c-.5.15-1.02-.13-1.17-.63-.15-.5.13-1.02.63-1.17 4.14-1.25 11.02-1.01 14.76 1.21.45.27.6.86.33 1.31-.27.45-.85.6-1.3.33z"/></svg>
               Spotify'da Dinle
             </button>
          </div>
        )}
      </div>
    </div>
  );
}

