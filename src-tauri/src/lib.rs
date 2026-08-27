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
use tokio::process::Command;
use tokio_util::io::ReaderStream;
use tower::ServiceExt;
use tower_http::{cors::CorsLayer, services::ServeFile};

struct AppState {
    tx: broadcast::Sender<String>,
}

// === İŞTE EFSANEVİ TRANSCODING (DÖNÜŞTÜRME) MOTORU ===
async fn stream_video(Query(params): Query<HashMap<String, String>>, req: Request) -> Response {
    let path = params.get("path").unwrap_or(&String::new()).to_string();
    let quality = params.get("quality").unwrap_or(&String::from("original")).to_string();

    // Eğer "Orijinal" seçilmişse, eski taktik (Hiç işlemci yorma, dosyayı direkt aktar)
    if quality == "original" || quality.is_empty() {
        return match ServeFile::new(&path).oneshot(req).await {
            Ok(res) => res.into_response(), // Burada standart Body'e çeviriyoruz
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    }

    // Seçilen Kaliteye Göre Çözünürlük ve Bant Genişliği Ayarı
    let (scale, bitrate) = match quality.as_str() {
        "1080p" => ("scale=-2:1080", "4M"),
        "720p"  => ("scale=-2:720", "2M"),
        "480p"  => ("scale=-2:480", "1M"),
        _       => ("scale=-2:720", "2M"),
    };

    println!("🎥 Anlık Dönüştürme Başladı: {} (Hedef: {})", path, quality);

    // FFmpeg'i Arka Planda Görünmez Şekilde Çalıştır
    let mut child = match Command::new("ffmpeg")
        .args(&[
            "-i", &path,                          // Girdi dosyası
            "-vf", scale,                         // Çözünürlüğü ayarla (Örn: 720p)
            "-c:v", "libx264",                    // H.264 formatına çevir
            "-preset", "ultrafast",               // İşlemciyi yorma, en hızlı şekilde çevir
            "-b:v", bitrate,                      // İnternet gönderim hızı (Örn: 2 Mbps)
            "-maxrate", bitrate,                  // Maksimum hızı sınırla (Donmaları engeller)
            "-bufsize", "4M",                     // Tampon bellek
            "-c:a", "aac",                        // Sesi AAC yap
            "-b:a", "128k",                       // Ses kalitesi
            "-movflags", "frag_keyframe+empty_moov", // Ağa akış yapabilmek için "Parçalı MP4" yap
            "-f", "mp4",                          // Çıktı formatı
            "-"                                   // Dosyaya kaydetme, DIREKT STDOUT'a (Bize) fırlat!
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // Konsolu loglarla boğmasın diye hataları şimdilik gizle
        .spawn()
    {
        Ok(child) => child,
        Err(_) => {
            println!("❌ FFmpeg sistemde bulunamadı! Lütfen FFmpeg kurun. Orijinal dosya gönderiliyor...");
            // HATANIN ÇÖZÜLDÜĞÜ YER: unwrap_or_else yerine match ile into_response yaptık!
            return match ServeFile::new(&path).oneshot(req).await {
                Ok(res) => res.into_response(),
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };
        }
    };

    // FFmpeg'in fırlattığı byte'ları alıp HTTP Body (Akış) haline getiriyoruz
    let stdout = child.stdout.take().unwrap();
    let stream = ReaderStream::new(stdout);
    let body = Body::from_stream(stream);

    // Akışı (Stream) tarayıcıya Video formatında yolla
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .body(body)
        .unwrap()
}

// === WEBSOCKET (PARTY WATCH) YÖNETİCİSİ ===
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

// === MEVCUT TAURİ KOMUTLARI ===
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

// === ANA BAŞLATICI ===
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            tauri::async_runtime::spawn(async {
                let (tx, _rx) = broadcast::channel(100);
                let app_state = Arc::new(AppState { tx });

                let app = Router::new()
                    .route("/video", get(stream_video))
                    .route("/ws", get(ws_handler))
                    .with_state(app_state)
                    .layer(CorsLayer::permissive());

                let listener = tokio::net::TcpListener::bind("0.0.0.0:8765").await.unwrap();
                println!("🚀 Kinflix Sunucusu yayında: http://0.0.0.0:8765");
                axum::serve(listener, app).await.unwrap();
            });
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_movies, 
            get_local_subtitles, 
            read_text_file,
            get_local_ip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}