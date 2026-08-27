// src/tmdb.ts
import { fetch } from "@tauri-apps/plugin-http";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

type TMDBMovieResult = { id: number; title: string; original_title: string; overview: string; poster_path: string | null; backdrop_path: string | null; release_date: string; vote_average: number; };
type TMDBSearchResponse = { page: number; results: TMDBMovieResult[]; total_pages: number; total_results: number; };
type TMDBMovieDetails = TMDBMovieResult & { runtime: number | null; genres: { id: number; name: string }[]; };

export type MovieMetadata = {
  tmdb_id: number; poster_url: string | null; backdrop_url: string | null;
  rating: number | null; overview: string | null; runtime: number | null; genres: string | null;
};

async function tmdbRequest<T>(endpoint: string, token: string): Promise<T> {
  if (!token) throw new Error("TMDB token is missing. Please set it in Settings.");
  
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });

  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return (await response.json()) as T;
}

// YENİ: lang parametresi eklendi
export async function searchMovie(title: string, year: number | null, token: string, lang: string): Promise<TMDBMovieResult | null> {
  const tmdbLang = lang === "tr" ? "tr-TR" : "en-US";
  const params = new URLSearchParams({ query: title, language: tmdbLang, include_adult: "false" });
  if (year) params.set("primary_release_year", String(year));
  const data = await tmdbRequest<TMDBSearchResponse>(`/search/movie?${params.toString()}`, token);
  return data.results.length === 0 ? null : data.results[0];
}

export async function getMovieDetails(tmdbId: number, token: string, lang: string): Promise<TMDBMovieDetails> {
  const tmdbLang = lang === "tr" ? "tr-TR" : "en-US";
  return await tmdbRequest<TMDBMovieDetails>(`/movie/${tmdbId}?language=${tmdbLang}`, token);
}

export async function getMovieMetadata(title: string, year: number | null, token: string, lang: string): Promise<MovieMetadata | null> {
  const movie = await searchMovie(title, year, token, lang);
  if (!movie) return null;
  const details = await getMovieDetails(movie.id, token, lang);

  return {
    tmdb_id: movie.id,
    poster_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
    backdrop_url: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
    rating: movie.vote_average,
    overview: movie.overview || null,
    runtime: details.runtime,
    genres: details.genres ? details.genres.map((g) => g.name).join(", ") : null,
  };
}