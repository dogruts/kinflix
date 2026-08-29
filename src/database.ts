// src/database.ts
import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

const isWeb = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window) && !('__TAURI_IPC__' in window) && !('__TAURI__' in window);

export async function getDatabase() {
  if (isWeb) return null; 
  if (!db) db = await Database.load("sqlite:myflix_v3.db");
  return db;
}

export async function initializeDatabase() {
  const database = await getDatabase();
  if (!database) return;

  // Ana Film Tablosu (Kişisel veriler çıkartıldı)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      year INTEGER,
      folder_path TEXT NOT NULL,
      video_path TEXT NOT NULL UNIQUE,
      poster_url TEXT,
      backdrop_url TEXT,
      tmdb_id INTEGER,
      rating REAL,
      overview TEXT,
      runtime INTEGER,
      genres TEXT,
      director TEXT,
      actors TEXT,
      collection_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // YENİ: Profile Özel İstatistik Tablosu
  await database.execute(`
    CREATE TABLE IF NOT EXISTS user_movie_stats (
      user_id TEXT NOT NULL,
      video_path TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      is_watched INTEGER DEFAULT 0,
      watch_count INTEGER DEFAULT 0,
      watchlist INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, video_path)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export type Movie = {
  id?: number;
  title: string;
  year: number | null;
  folder_path: string;
  video_path: string;
  poster_url?: string | null;
  backdrop_url?: string | null;
  tmdb_id?: number | null;
  rating?: number | null;
  overview?: string | null;
  runtime?: number | null;
  genres?: string | null;
  director?: string | null;
  actors?: string | null;
  collection_name?: string | null;
  is_watched?: number;
  watch_count?: number;
  progress?: number;
  updated_at?: string;
  watchlist?: number;
};

export async function saveMovie(movie: Movie) {
  const database = await getDatabase();
  if (!database) return;

  await database.execute(
    `INSERT INTO movies (title, year, folder_path, video_path, poster_url, backdrop_url, tmdb_id, rating, overview, runtime, genres, director, actors, collection_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT(video_path) DO UPDATE SET
       title = excluded.title, year = excluded.year, folder_path = excluded.folder_path,
       poster_url = COALESCE(excluded.poster_url, movies.poster_url),
       backdrop_url = COALESCE(excluded.backdrop_url, movies.backdrop_url),
       tmdb_id = COALESCE(excluded.tmdb_id, movies.tmdb_id),
       rating = COALESCE(excluded.rating, movies.rating),
       overview = COALESCE(excluded.overview, movies.overview),
       runtime = COALESCE(excluded.runtime, movies.runtime),
       genres = COALESCE(excluded.genres, movies.genres),
       director = COALESCE(excluded.director, movies.director),
       actors = COALESCE(excluded.actors, movies.actors),
       collection_name = COALESCE(excluded.collection_name, movies.collection_name)`,
    [movie.title, movie.year, movie.folder_path, movie.video_path, movie.poster_url ?? null, movie.backdrop_url ?? null, movie.tmdb_id ?? null, movie.rating ?? null, movie.overview ?? null, movie.runtime ?? null, movie.genres ?? null, movie.director ?? null, movie.actors ?? null, movie.collection_name ?? null]
  );
}

export async function updateMovieMetadata(videoPath: string, metadata: any) {
  const database = await getDatabase();
  if (!database) return;

  await database.execute(
    `UPDATE movies SET tmdb_id = $1, poster_url = $2, backdrop_url = $3, rating = $4, overview = $5, runtime = $6, genres = $7, director = $8, actors = $9, collection_name = $10 WHERE video_path = $11`,
    [metadata.tmdb_id, metadata.poster_url, metadata.backdrop_url, metadata.rating, metadata.overview, metadata.runtime, metadata.genres, metadata.director, metadata.actors, metadata.collection_name, videoPath]
  );
}

// YENİ: İlerlemeyi (Progress) sadece o anki aktif profile kaydeder
export async function updateMovieProgress(userId: string, videoPath: string, progress: number, isWatched: number, watchCount: number) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`
    INSERT INTO user_movie_stats (user_id, video_path, progress, is_watched, watch_count, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, video_path) DO UPDATE SET
      progress = excluded.progress,
      is_watched = excluded.is_watched,
      watch_count = excluded.watch_count,
      updated_at = CURRENT_TIMESTAMP
  `, [userId, videoPath, progress, isWatched, watchCount]);
}

// YENİ: Watchlist'i sadece o anki aktif profile kaydeder
export async function setWatchlist(userId: string, videoPath: string, status: number) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`
    INSERT INTO user_movie_stats (user_id, video_path, watchlist, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, video_path) DO UPDATE SET
      watchlist = excluded.watchlist,
      updated_at = CURRENT_TIMESTAMP
  `, [userId, videoPath, status]);
}

// YENİ: Filmleri çekerken ana tablo ile profilin özel tablosunu birleştirir (LEFT JOIN)
export async function getMovies(userId: string = "default"): Promise<Movie[]> {
  const database = await getDatabase();
  if (!database) return []; 
  return await database.select<Movie[]>(`
    SELECT m.*, 
           COALESCE(u.progress, 0) as progress,
           COALESCE(u.is_watched, 0) as is_watched,
           COALESCE(u.watch_count, 0) as watch_count,
           COALESCE(u.watchlist, 0) as watchlist,
           COALESCE(u.updated_at, m.updated_at) as updated_at
    FROM movies m
    LEFT JOIN user_movie_stats u ON m.video_path = u.video_path AND u.user_id = $1
    ORDER BY m.title COLLATE NOCASE
  `, [userId]);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  if (!database) return null;
  const result = await database.select<{key: string, value: string}[]>(`SELECT value FROM settings WHERE key = $1`, [key]);
  return result.length > 0 ? result[0].value : null;
}

export async function setSetting(key: string, value: string) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
}

export async function removeLibraryFolder(folderPath: string) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`DELETE FROM movies WHERE folder_path = $1`, [folderPath]);
}

export async function removeMovie(videoPath: string) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`DELETE FROM movies WHERE video_path = $1`, [videoPath]);
  await database.execute(`DELETE FROM user_movie_stats WHERE video_path = $1`, [videoPath]);
}

export async function clearDatabase() {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`DELETE FROM movies`);
  await database.execute(`DELETE FROM user_movie_stats`);
}