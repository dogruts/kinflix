// src/tmdb.ts
import { fetch } from "@tauri-apps/plugin-http";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

type TMDBMovieResult = { id: number; title: string; original_title: string; overview: string; poster_path: string | null; backdrop_path: string | null; release_date: string; vote_average: number; };
type TMDBSearchResponse = { page: number; results: TMDBMovieResult[]; total_pages: number; total_results: number; };
type TMDBCast = { name: string; known_for_department: string; order: number };
type TMDBCrew = { name: string; job: string };
type TMDBCollection = { id: number; name: string; poster_path: string; backdrop_path: string };
type TMDBMovieDetails = TMDBMovieResult & { runtime: number | null; genres: { id: number; name: string }[]; belongs_to_collection: TMDBCollection | null; credits?: { cast: TMDBCast[]; crew: TMDBCrew[] }; };

export type MovieMetadata = {
  tmdb_id: number; poster_url: string | null; backdrop_url: string | null;
  rating: number | null; overview: string | null; runtime: number | null; genres: string | null;
  director: string | null; actors: string | null; collection_name: string | null;
};

async function tmdbRequest<T>(endpoint: string, token: string): Promise<T> {
  if (!token) throw new Error("TMDB token is missing.");
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, { method: "GET", headers: { Authorization: `Bearer ${token}`, accept: "application/json" }});
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return (await response.json()) as T;
}

export async function searchMovie(title: string, year: number | null, token: string, lang: string): Promise<TMDBMovieResult | null> {
  const tmdbLang = lang === "tr" ? "tr-TR" : "en-US";
  const params = new URLSearchParams({ query: title, language: tmdbLang, include_adult: "false" });
  if (year) params.set("primary_release_year", String(year));
  const data = await tmdbRequest<TMDBSearchResponse>(`/search/movie?${params.toString()}`, token);
  return data.results.length === 0 ? null : data.results[0];
}

export async function getMovieDetails(tmdbId: number, token: string, lang: string): Promise<TMDBMovieDetails> {
  const tmdbLang = lang === "tr" ? "tr-TR" : "en-US";
  return await tmdbRequest<TMDBMovieDetails>(`/movie/${tmdbId}?language=${tmdbLang}&append_to_response=credits`, token);
}

export async function getMovieMetadata(title: string, year: number | null, token: string, lang: string): Promise<MovieMetadata | null> {
  const movie = await searchMovie(title, year, token, lang);
  if (!movie) return null;
  const details = await getMovieDetails(movie.id, token, lang);

  let director = null;
  let actorsStr = null;

  if (details.credits) {
    const d = details.credits.crew.find(c => c.job === "Director");
    if (d) director = d.name;
    const topCast = details.credits.cast.slice(0, 5).map(c => c.name);
    if (topCast.length > 0) actorsStr = topCast.join(", ");
  }

  return {
    tmdb_id: movie.id,
    poster_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
    backdrop_url: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
    rating: movie.vote_average,
    overview: movie.overview || null,
    runtime: details.runtime,
    genres: details.genres ? details.genres.map((g) => g.name).join(", ") : null,
    director: director,
    actors: actorsStr,
    collection_name: details.belongs_to_collection ? details.belongs_to_collection.name : null,
  };
}