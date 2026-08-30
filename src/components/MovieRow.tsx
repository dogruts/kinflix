import { useEffect, useRef } from "react";
import type { Movie } from "../database";
import { MovieCardFallback } from "./MovieCardFallback";

export const MovieRow = ({ title, data, onMovieClick }: { title: string, data: Movie[], onMovieClick: (movie: Movie) => void }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const showArrows = data.length > 5;
  const loopData = showArrows ? [...data, ...data, ...data] : data;

  useEffect(() => {
    if (rowRef.current && showArrows) {
      rowRef.current.scrollLeft = rowRef.current.scrollWidth / 3;
    }
  }, [showArrows, data.length]);

  if (data.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const { clientWidth } = rowRef.current;
      const scrollAmount = clientWidth * 0.8;
      rowRef.current.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
    }
  };

  const handleScrollEvent = () => {
    if (!rowRef.current || !showArrows) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    const singleSetWidth = scrollWidth / 3;

    if (scrollLeft < singleSetWidth * 0.5) {
      rowRef.current.scrollLeft += singleSetWidth;
    } else if (scrollLeft > singleSetWidth * 2.5 - clientWidth) {
      rowRef.current.scrollLeft -= singleSetWidth;
    }
  };

  return (
    <div className="mb-10 relative group">
      <h2 className="mb-4 text-xl font-bold text-white md:text-2xl">{title}</h2>
      {showArrows && <button onClick={() => scroll("left")} className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/80 p-2 text-4xl text-white opacity-0 transition group-hover:opacity-100 md:flex items-center justify-center hover:scale-110 hover:text-red-500 backdrop-blur rounded-r h-full max-h-40">❮</button>}
      <div
        ref={rowRef}
        onScroll={handleScrollEvent}
        className="flex gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loopData.map((movie, idx) => (
          <div
            key={movie.video_path + idx}
            tabIndex={0}
            className="w-40 flex-shrink-0 sm:w-48 xl:w-56 focus:scale-110 focus:-translate-y-2 focus:z-50 focus:ring-4 focus:ring-white outline-none rounded-lg transition-all duration-300"
            onClick={() => onMovieClick(movie)}
            onKeyDown={(e) => e.key === 'Enter' && onMovieClick(movie)}
          >
            <MovieCardFallback movie={movie} />
          </div>
        ))}
      </div>
      {showArrows && <button onClick={() => scroll("right")} className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 bg-black/80 p-2 text-4xl text-white opacity-0 transition group-hover:opacity-100 md:flex items-center justify-center hover:scale-110 hover:text-red-500 backdrop-blur rounded-l h-full max-h-40">❯</button>}
    </div>
  );
};
