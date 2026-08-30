import type { Movie } from "../database";

export const MovieCardFallback = ({ movie }: { movie: Movie }) => (
  <div className="w-full h-full aspect-[2/3] relative group bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-500 transition-all duration-300 shadow-lg cursor-pointer">
    {movie.poster_url ? (
      <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
    ) : (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 p-3 text-center">
        <span className="text-4xl mb-3 opacity-50">🎬</span>
        <span className="text-zinc-300 text-sm font-bold tracking-wider leading-snug px-1 line-clamp-3">
          {movie.title}
        </span>
      </div>
    )}
    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
      <h3 className="text-white font-bold text-sm line-clamp-2 leading-tight mb-1">{movie.title}</h3>
      {movie.year ? <span className="text-zinc-400 text-xs font-semibold">{movie.year}</span> : null}
      {(movie.progress || 0) > 5 && (movie.is_watched || 0) === 0 && (
        <div className="w-full h-1 bg-zinc-700 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-red-600" style={{ width: `${Math.min(((movie.progress || 0) / ((movie.runtime || 120) * 60)) * 100, 100)}%` }}></div>
        </div>
      )}
    </div>
    {movie.rating != null && movie.rating > 0 && (
      <div className="absolute top-2 right-2 bg-black/80 text-yellow-500 text-[11px] font-bold px-1.5 py-0.5 rounded border border-yellow-900/50 backdrop-blur shadow-xl z-10 flex items-center gap-1">
        ⭐ {movie.rating.toFixed(1)}
      </div>
    )}
  </div>
);
