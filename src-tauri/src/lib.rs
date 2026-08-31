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
        let mut response = match ServeFile::new(&path).oneshot(req).await {
            Ok(res) => res.into_response(),
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };

        // YENİ: TV'nin MKV formatını tanıyıp çökmemesi için doğru etiketleme (MIME TYPE ZORLAMASI)
        let content_type = if path.to_lowercase().ends_with(".mkv") {
            "video/x-matroska"
        } else if path.to_lowercase().ends_with(".webm") {
            "video/webm"
        } else {
            "video/mp4"
        };

        // Başlıkları eziyoruz
        response.headers_mut().insert(header::CONTENT_TYPE, content_type.parse().unwrap());
        response.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".parse().unwrap());
        
        return response;
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
            // FFmpeg çalışmazsa fallback olarak yine orijinal dosyayı TV uyumlu gönderiyoruz
            let mut response = match ServeFile::new(&path).oneshot(req).await {
                Ok(res) => res.into_response(),
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };

            let content_type = if path.to_lowercase().ends_with(".mkv") { "video/x-matroska" } else { "video/mp4" };
            response.headers_mut().insert(header::CONTENT_TYPE, content_type.parse().unwrap());
            response.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".parse().unwrap());
            
            return response;
        }
    };

    let stdout = child.stdout.take().unwrap();
    let stream = ReaderStream::new(stdout);
    let body = Body::from_stream(stream);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4") // FFmpeg çevirisi her zaman mp4 çıkarır
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap()
}

// YENİ: Havada (On-the-Fly) H265 -> H264 Çeviri Uç Noktası (SEEK / İLERİ SARMA DESTEKLİ)
async fn transcode_stream(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let path = params.get("path").unwrap_or(&String::new()).to_string();
    let start_time = params.get("start").unwrap_or(&String::from("0")).to_string(); 
    
    let mut ffmpeg_args: Vec<String> = Vec::new();

    if start_time != "0" && !start_time.is_empty() {
        ffmpeg_args.push("-ss".to_string());
        ffmpeg_args.push(start_time);
    }

    ffmpeg_args.extend(vec![
        "-i".to_string(), path,
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "ultrafast".to_string(),
        "-crf".to_string(), "28".to_string(), 
        "-c:a".to_string(), "aac".to_string(),
        // MATROSKA formatı sınırsız süre (live stream) için en stabil çözümdür, 10 saniye bug'ını çözer
        "-f".to_string(), "matroska".to_string(),
        "pipe:1".to_string(),
    ]);

    let mut cmd = TokioCommand::new("ffmpeg")
        .args(&ffmpeg_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("FFmpeg başlatılamadı");

    let stream = ReaderStream::new(cmd.stdout.take().unwrap());
    
    Response::builder()
        .header(header::CONTENT_TYPE, "video/x-matroska") // Chrome bunu Native Live Stream olarak tanır
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from_stream(stream))
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

// YENİ: İnternetten indirilen altyazıyı filmin klasörüne kalıcı olarak kaydeder
#[tauri::command]
fn save_subtitle_file(video_path: String, content: String, lang: String) -> Result<(), String> {
    let path = std::path::Path::new(&video_path);
    let srt_path = path.with_extension(format!("{}.srt", lang));
    std::fs::write(srt_path, content).map_err(|e| e.to_string())
}

use walkdir::WalkDir;
use regex::Regex;

#[tauri::command]
fn scan_movies(path: String) -> Result<Vec<serde_json::Value>, String> {
    let mut movies = Vec::new();
    
    // Regex: S01E01 veya 1x01 tarzı dizi bölümlerini bulmak için
    let tv_regex = Regex::new(r"(?i)(S\d{1,2}E\d{1,2}|\b\d{1,2}x\d{1,2}\b)").unwrap();
    let year_regex = Regex::new(r"(?i)[\s\.\(\[\-_]?((?:19|20)\d{2})[\s\.\)\]\-_]?").unwrap();
    let junk_regex = Regex::new(r"(?i)(extended|directors?[\s\._]*cut|unrated|remastered|imax|1080p|720p|480p|2160p|4k|bluray|x264|x265|hevc|dual|remux|webrip|hdrip|hdtv|yify|yts|aac|dd5|xvid).*$").unwrap();

    // WalkDir ile derin tarama (recursive)
    for entry in WalkDir::new(path.clone()).into_iter().filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ext_str == "mp4" || ext_str == "mkv" || ext_str == "avi" {
                    let original_title = entry_path.file_stem().unwrap().to_string_lossy().to_string();
                    
                    let mut is_series = 0;
                    let mut clean_title = original_title.clone();
                    
                    // 1. Dizi Tespiti
                    if tv_regex.is_match(&clean_title) {
                        is_series = 1;
                    }
                    
                    // 2. Yıl Tespiti (Varsa)
                    let mut year = None;
                    if let Some(caps) = year_regex.captures(&clean_title) {
                        if let Ok(y) = caps[1].parse::<i32>() {
                            year = Some(y);
                        }
                    }

                    // 3. Çöp Yazıları Temizleme (Smart Parser)
                    clean_title = junk_regex.replace_all(&clean_title, "").to_string();
                    clean_title = clean_title.replace(".", " ").replace("_", " ").trim().to_string();
                    
                    if let Some(y) = year {
                        clean_title = clean_title.replace(&y.to_string(), "").trim().to_string();
                    }
                    
                    // Parantezleri sil
                    let bracket_regex = Regex::new(r"(\[.*?\]|\(.*?\))").unwrap();
                    clean_title = bracket_regex.replace_all(&clean_title, "").trim().to_string();

                    let mut local_poster = String::new();
                    if let Some(parent_dir) = entry_path.parent() {
                        let poster_jpg = parent_dir.join("poster.jpg");
                        let cover_jpg = parent_dir.join("cover.jpg");
                        if poster_jpg.exists() {
                            local_poster = poster_jpg.to_string_lossy().to_string();
                        } else if cover_jpg.exists() {
                            local_poster = cover_jpg.to_string_lossy().to_string();
                        }
                    }

                    movies.push(serde_json::json!({
                        "title": if clean_title.is_empty() { original_title } else { clean_title },
                        "year": year,
                        "folder_path": path.clone(),
                        "video_path": entry_path.to_string_lossy().to_string(),
                        "is_series": is_series,
                        "poster_path": if local_poster.is_empty() { serde_json::Value::Null } else { serde_json::json!(local_poster) }
                    }));
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
                    .route("/transcode", get(transcode_stream)) // YENİ: Anlık Çeviri Rotası
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

                // UDP Broadcast (Auto-Discovery) Sinyali Yayici
                tokio::spawn(async {
                    if let Ok(socket) = tokio::net::UdpSocket::bind("0.0.0.0:0").await {
                        socket.set_broadcast(true).unwrap();
                        let msg = b"KINFLIX_SERVER_HERE";
                        loop {
                            // Ağdaki tüm cihazların 8766 portuna "Buradayım" diye bağırır
                            let _ = socket.send_to(msg, "255.255.255.255:8766").await;
                            tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        }
                    }
                });

                let _ = axum::serve(listener, app).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_movies,
            get_local_subtitles,
            read_text_file,
            save_subtitle_file, // YENİ: Altyazı kaydetme fonksiyonu Tauri'ye tanıtıldı
            convert_to_x264,
            get_local_ip,
            start_tunnel,
            download_offline_poster,
            generate_ai_subtitle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::io::Write;

#[tauri::command]
async fn download_offline_poster(video_path: String, poster_url: String) -> Result<String, String> {
    let path = std::path::Path::new(&video_path);
    let dir = path.parent().ok_or("Klasör bulunamadı")?;
    let poster_path = dir.join("poster.jpg");

    // Eğer zaten inmişse tekrar indirme
    if poster_path.exists() {
        return Ok(poster_path.to_string_lossy().to_string());
    }

    // URL'den resmi indir
    let response = reqwest::get(&poster_url).await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    // Filmin yanına kaydet
    let mut file = std::fs::File::create(&poster_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(poster_path.to_string_lossy().to_string())
}

// main.rs içine ekle
use std::path::Path;

#[tauri::command]
async fn generate_ai_subtitle(video_path: String) -> Result<String, String> {
    let v_path = Path::new(&video_path);
    let dir = v_path.parent().unwrap();
    
    // Dosya yolları
    let audio_path = dir.join("temp_audio.wav");
    let srt_output_path = v_path.with_extension("ai.srt"); 
    let model_path = "C:\\Kinflix\\models\\ggml-base.bin"; // İndirdiğin Whisper modelinin yolu
    
    if !Path::new(model_path).exists() {
        return Err(format!("Whisper yapay zeka modeli bulunamadı!\nLütfen model dosyasını şuraya indirin:\n{}", model_path));
    }

    println!("🤖 1/2: Sesi ayrıştırıyorum...");
    
    // 1. Adım: FFmpeg ile sesi 16kHz WAV formatına çevir (Whisper sadece bunu anlar)
    let ffmpeg_status = tokio::process::Command::new("ffmpeg")
        .args(&[
            "-i", &video_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            audio_path.to_str().unwrap(),
            "-y" // Varsa üstüne yaz
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map_err(|e| format!("FFmpeg hatası: {}", e))?;

    if !ffmpeg_status.success() {
        return Err("Sesi ayıklarken hata oluştu.".to_string());
    }

    println!("🤖 2/2: Whisper AI altyazı üretiyor...");

    // 2. Adım: whisper.cpp CLI (main.exe) aracını çalıştır (Senin bunu indirip bin klasörüne koyman lazım)
    // -osrt parametresi doğrudan .srt dosyası çıkarır.
    let whisper_status = tokio::process::Command::new("whisper-cli") // veya "main.exe"
        .args(&[
            "-m", model_path,
            "-f", audio_path.to_str().unwrap(),
            "-osrt",
            "-of", srt_output_path.with_extension("").to_str().unwrap() // .srt uzantısını kendi ekler
        ])
        .status()
        .await
        .map_err(|e| format!("Whisper çalıştırılamadı: {}", e))?;

    // Çöpleri temizle (Geçici wav dosyasını sil)
    let _ = tokio::fs::remove_file(audio_path).await;

    if whisper_status.success() {
        Ok(srt_output_path.to_string_lossy().to_string())
    } else {
        Err("Yapay zeka altyazı üretemedi.".to_string())
    }
}