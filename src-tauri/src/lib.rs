use axum::{
    body::Body,
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use local_ip_address::local_ip;
use std::{collections::HashMap, sync::Arc, process::Stdio};
use tokio::sync::broadcast;
use tokio::process::Command as TokioCommand;
use std::process::Command as StdCommand;
use tokio_util::io::ReaderStream;
use tower::ServiceExt;
use tower_http::{cors::CorsLayer, services::ServeFile};
use rusqlite::Connection;

struct AppState {
    tx: broadcast::Sender<String>,
}

async fn get_catalog() -> impl IntoResponse {
    let db_path = "kinflix.db"; 
    let mut movies = Vec::new();

    if let Ok(conn) = Connection::open(db_path) {
        if let Ok(mut stmt) = conn.prepare("SELECT title, year, folder_path, video_path, backdrop_url, poster_url, overview, rating, genres, runtime, progress, watchlist, director, actors, collection_name, is_watched, watch_count FROM movies") {
            let movie_iter = stmt.query_map([], |row| {
                Ok(serde_json::json!({
                    "title": row.get::<_, String>(0).unwrap_or_default(),
                    "year": row.get::<_, Option<i32>>(1).unwrap_or(None),
                    "folder_path": row.get::<_, String>(2).unwrap_or_default(),
                    "video_path": row.get::<_, String>(3).unwrap_or_default(),
                    "backdrop_url": row.get::<_, Option<String>>(4).unwrap_or(None),
                    "poster_url": row.get::<_, Option<String>>(5).unwrap_or(None),
                    "overview": row.get::<_, Option<String>>(6).unwrap_or(None),
                    "rating": row.get::<_, Option<f64>>(7).unwrap_or(None),
                    "genres": row.get::<_, Option<String>>(8).unwrap_or(None),
                    "runtime": row.get::<_, Option<i32>>(9).unwrap_or(None),
                    "progress": row.get::<_, Option<i32>>(10).unwrap_or(None),
                    "watchlist": row.get::<_, i32>(11).unwrap_or(0),
                    "director": row.get::<_, Option<String>>(12).unwrap_or(None),
                    "actors": row.get::<_, Option<String>>(13).unwrap_or(None),
                    "collection_name": row.get::<_, Option<String>>(14).unwrap_or(None),
                    "is_watched": row.get::<_, i32>(15).unwrap_or(0),
                    "watch_count": row.get::<_, i32>(16).unwrap_or(0),
                }))
            });

            if let Ok(iter) = movie_iter {
                for m in iter.flatten() {
                    movies.push(m);
                }
            }
        }
    }
    axum::Json(movies)
}

// === 2. ALTYAZI DAĞITICI (MİSAFİRLER İÇİN) ===
async fn serve_subtitle(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let path = params.get("path").unwrap_or(&String::new()).to_string();
    if let Ok(content) = std::fs::read_to_string(&path) {
        Response::builder()
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Body::from(content))
            .unwrap()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

// === 3. VİDEO STREAMING & TRANSCODING (FFMPEG) ===
async fn stream_video(Query(params): Query<HashMap<String, String>>, req: Request) -> Response {
    let path = params.get("path").unwrap_or(&String::new()).to_string();
    let quality = params.get("quality").unwrap_or(&String::from("original")).to_string();

    if quality == "original" || quality.is_empty() {
        return match ServeFile::new(&path).oneshot(req).await {
            Ok(res) => res.into_response(),
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    }

    let (scale, bitrate) = match quality.as_str() {
        "1080p" => ("scale=-2:1080", "4M"),
        "720p"  => ("scale=-2:720", "2M"),
        "480p"  => ("scale=-2:480", "1M"),
        _       => ("scale=-2:720", "2M"),
    };

    let mut child = match TokioCommand::new("ffmpeg")
        .args(&[
            "-i", &path,
            "-vf", scale,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            "-maxrate", bitrate,
            "-bufsize", "4M",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "frag_keyframe+empty_moov",
            "-f", "mp4",
            "-"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => {
            return match ServeFile::new(&path).oneshot(req).await {
                Ok(res) => res.into_response(),
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };
        }
    };

    let stdout = child.stdout.take().unwrap();
    let stream = ReaderStream::new(stdout);
    let body = Body::from_stream(stream);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .body(body)
        .unwrap()
}

// === 4. ESKİ WEBSOCKET (WEBRTC İLE BİRLİKTE YEDEK OLARAK DURUYOR) ===
async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() { break; }
        }
    });

    let tx = state.tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg { let _ = tx.send(text); }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

// === 5. TAURI KOMUTLARI ===
#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    match local_ip() {
        Ok(ip) => Ok(ip.to_string()),
        Err(_) => Ok("127.0.0.1".to_string()),
    }
}

#[tauri::command]
fn get_local_subtitles(video_path: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&video_path);
    let dir = path.parent().ok_or("No parent directory")?;
    let mut subtitles = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "srt" {
                        subtitles.push(entry_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    Ok(subtitles)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_movies(path: String) -> Result<Vec<serde_json::Value>, String> {
    let mut movies = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path.clone()) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if ext_str == "mp4" || ext_str == "mkv" || ext_str == "avi" {
                        let title = entry_path.file_stem().unwrap().to_string_lossy().to_string();
                        movies.push(serde_json::json!({
                            "title": title,
                            "year": null,
                            "folder_path": path,
                            "video_path": entry_path.to_string_lossy().to_string()
                        }));
                    }
                }
            }
        }
    }
    Ok(movies)
}

#[tauri::command]
fn start_tunnel() -> Result<String, String> {
    let output = StdCommand::new("npx")
        .args(&["localtunnel", "--port", "8765"])
        .spawn();

    match output {
        Ok(_) => Ok("https://kinflix-party.loca.lt".to_string()),
        Err(e) => Err(format!("Tünel başlatılamadı: {}", e))
    }
}

// === 6. ANA FONKSİYON VE ROUTER BAŞLATICI ===
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            tauri::async_runtime::spawn(async {
                let (tx, _rx) = broadcast::channel(100);
                let app_state = Arc::new(AppState { tx });

                let app = Router::new()
                    .route("/video", get(stream_video))
                    .route("/movies", get(get_catalog))
                    .route("/subtitle", get(serve_subtitle))
                    .route("/ws", get(ws_handler))
                    .with_state(app_state)
                    .layer(CorsLayer::permissive());

                let listener = match tokio::net::TcpListener::bind("0.0.0.0:8765").await {
                    Ok(l) => l,
                    Err(e) => {
                        eprintln!("Sunucu başlatılamadı: {}", e);
                        return;
                    }
                };

                println!("🚀 Kinflix Sunucusu yayında: http://0.0.0.0:8765");

                let _ = axum::serve(listener, app).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_movies,
            get_local_subtitles,
            read_text_file,
            convert_to_x264,
            get_local_ip,
            start_tunnel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// FFmpeg kullanarak videoyu x264 MP4 formatına çeviren komut
#[tauri::command]
async fn convert_to_x264(video_path: String) -> Result<String, String> {
    let output_path = video_path.replace(".mkv", "_web.mp4").replace(".mp4", "_web.mp4").replace(".avi", "_web.mp4");
    
    let status = std::process::Command::new("ffmpeg")
        .args(["-i", &video_path, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", &output_path])
        .status()
        .map_err(|e| format!("FFmpeg çalıştırılamadı. Bilgisayarında FFmpeg yüklü mü? Hata: {}", e))?;

    if status.success() {
        Ok(output_path)
    } else {
        Err("Dönüştürme işlemi başarısız oldu.".to_string())
    }
}