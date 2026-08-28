// src/database.ts
import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

// Tarayıcı mı yoksa Masaüstü mü kontrolü
const isWeb = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window) && !('__TAURI_IPC__' in window) && !('__TAURI__' in window);

export async function getDatabase() {
  if (isWeb) return null; // Web'de veritabanı yok
  if (!db) db = await Database.load("sqlite:myflix_v3.db");
  return db;
}

export async function initializeDatabase() {
  const database = await getDatabase();
  if (!database) return; // WEB KORUMASI: Veritabanı yoksa pas geç

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
      is_watched INTEGER DEFAULT 0,
      watch_count INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  try { await database.execute(`ALTER TABLE movies ADD COLUMN watchlist INTEGER DEFAULT 0`); } catch (e) {}
  try { await database.execute(`ALTER TABLE movies ADD COLUMN director TEXT`); } catch (e) {}
  try { await database.execute(`ALTER TABLE movies ADD COLUMN actors TEXT`); } catch (e) {}
  try { await database.execute(`ALTER TABLE movies ADD COLUMN collection_name TEXT`); } catch (e) {}
  try { await database.execute(`ALTER TABLE movies ADD COLUMN is_watched INTEGER DEFAULT 0`); } catch (e) {}
  try { await database.execute(`ALTER TABLE movies ADD COLUMN watch_count INTEGER DEFAULT 0`); } catch (e) {}

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
    `INSERT INTO movies (title, year, folder_path, video_path, poster_url, backdrop_url, tmdb_id, rating, overview, runtime, genres, director, actors, collection_name, is_watched, watch_count, progress, watchlist)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
       collection_name = COALESCE(excluded.collection_name, movies.collection_name),
       is_watched = COALESCE(excluded.is_watched, movies.is_watched),
       watch_count = COALESCE(excluded.watch_count, movies.watch_count),
       watchlist = COALESCE(excluded.watchlist, movies.watchlist)`,
    [movie.title, movie.year, movie.folder_path, movie.video_path, movie.poster_url ?? null, movie.backdrop_url ?? null, movie.tmdb_id ?? null, movie.rating ?? null, movie.overview ?? null, movie.runtime ?? null, movie.genres ?? null, movie.director ?? null, movie.actors ?? null, movie.collection_name ?? null, movie.is_watched ?? 0, movie.watch_count ?? 0, movie.progress ?? 0, movie.watchlist ?? 0]
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

export async function updateMovieProgress(videoPath: string, progress: number, isWatched: number, watchCount: number) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`UPDATE movies SET progress = $1, is_watched = $2, watch_count = $3, updated_at = CURRENT_TIMESTAMP WHERE video_path = $4`, [progress, isWatched, watchCount, videoPath]);
}

export async function setWatchlist(videoPath: string, status: number) {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`UPDATE movies SET watchlist = $1, updated_at = CURRENT_TIMESTAMP WHERE video_path = $2`, [status, videoPath]);
}

export async function getMovies(): Promise<Movie[]> {
  const database = await getDatabase();
  if (!database) return []; // Web'de boş film listesi dön
  return await database.select<Movie[]>(`SELECT * FROM movies ORDER BY title COLLATE NOCASE`);
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
}

export async function clearDatabase() {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(`DELETE FROM movies`);
}