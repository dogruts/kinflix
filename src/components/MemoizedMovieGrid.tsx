import React from 'react';
import { type Movie } from '../database';
import { MovieCardFallback } from './MovieCardFallback';

interface Props {
  movies: Movie[];
  onMovieClick: (movie: Movie) => void;
}

const MemoizedMovieGrid = React.memo(({ movies, onMovieClick }: Props) => {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
      {movies.map((movie) => (
        <div key={movie.video_path} onClick={() => onMovieClick(movie)}>
          <MovieCardFallback movie={movie} />
        </div>
      ))}
    </div>
  );
});

export default MemoizedMovieGrid;

