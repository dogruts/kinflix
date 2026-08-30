import { useEffect, useMemo, useState } from "react";
import type { Movie } from "../database";
import { shuffleArray } from "../utils/helpers";

export const HeroBanner = ({ movies, onPlay, onInfo, t }: { movies: Movie[], onPlay: (m: Movie) => void, onInfo: (m: Movie) => void, t: any }) => {
  const heroMovies = useMemo(() => shuffleArray(movies.filter((m: Movie) => m.backdrop_url)).slice(0, 10), [movies]);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (heroMovies.length <= 1) return;
    const interval = setInterval(() => setHeroIndex(prev => (prev + 1) % heroMovies.length), 8000);
    return () => clearInterval(interval);
  }, [heroMovies]);

  const heroMovie = heroMovies[heroIndex] || movies[0];
  if (!heroMovie) return null;

  return (
    <div className="relative -mt-24 mb-10 h-[70vh] w-full transition-all duration-1000 ease-in-out">
      {heroMovie.backdrop_url ? <img src={heroMovie.backdrop_url} key={heroMovie.video_path} className="h-full w-full object-cover opacity-80 animate-in fade-in duration-1000" /> : <div className="h-full w-full bg-zinc-900" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/20 to-[#0b0b0b]/40" />
      <div className="absolute bottom-20 left-10 z-10 max-w-2xl drop-shadow-2xl">
        <h1 className="text-6xl font-extrabold md:text-7xl">{heroMovie.title}</h1>
        <p className="mt-4 line-clamp-3 text-lg font-medium text-zinc-300">{heroMovie.overview}</p>
        <div className="mt-6 flex gap-4">
          <button onClick={() => onPlay(heroMovie)} className="flex items-center gap-2 rounded bg-white px-8 py-3 text-xl font-bold text-black transition hover:bg-zinc-200"><span className="text-2xl">▶</span> {(heroMovie.progress || 0) > 0 ? t.resume : t.play}</button>
          <button onClick={() => onInfo(heroMovie)} className="flex items-center gap-2 rounded bg-zinc-500/50 px-8 py-3 text-xl font-bold text-white backdrop-blur transition hover:bg-zinc-500/70">{t.info}</button>
        </div>
      </div>
    </div>
  );
};
