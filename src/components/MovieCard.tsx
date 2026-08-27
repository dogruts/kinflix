// src/components/MovieCard.tsx
import { type Movie } from "../database";

export default function MovieCard({ movie }: { movie: Movie }) {
  return (
    <div className="group relative aspect-[2/3] cursor-pointer overflow-hidden rounded-md bg-zinc-900 transition-all duration-300 hover:z-10 hover:scale-105 hover:shadow-2xl hover:shadow-black/60 hover:ring-2 hover:ring-zinc-600">
      
      {/* Poster Görseli */}
      {movie.poster_url ? (
        <img
          src={movie.poster_url}
          alt={movie.title}
          loading="lazy"
          className="h-full w-full object-cover transition-opacity duration-300"
        />
      ) : (
        // Posteri olmayan filmler için Fallback (Yedek) Tasarım
        <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
          <span className="mb-2 text-4xl">🎬</span>
          <span className="text-sm font-semibold text-zinc-400">
            {movie.title}
          </span>
        </div>
      )}

      {/* Hover Olunca Alttan Çıkan Gradient Bilgi Ekranı */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        
        <h3 className="line-clamp-2 text-sm font-bold text-white shadow-black drop-shadow-md">
          {movie.title}
        </h3>
        
        <div className="mt-1.5 flex items-center gap-2 text-xs font-medium">
          {movie.year && (
            <span className="text-zinc-300">{movie.year}</span>
          )}
          
          {movie.rating != null && movie.rating > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              ⭐ {movie.rating.toFixed(1)}
            </span>
          )}
          
          {movie.runtime != null && movie.runtime > 0 && (
            <span className="text-zinc-400">{movie.runtime} dk</span>
          )}
        </div>
        
      </div>
      
    </div>
  );
}