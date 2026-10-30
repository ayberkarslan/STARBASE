// Add starbase-native = { path = "../native" } and tauri-plugin-opener = "2".
// Register opener plugin and these commands in your existing Tauri builder.
use tauri_plugin_opener::OpenerExt;
#[tauri::command]
async fn starbase_login(app:tauri::AppHandle)->Result<serde_json::Value,String>{
 let client=starbase_native::Starbase::new("https://YOUR-STARBASE.workers.dev","starlab-desktop")?;
 client.login(|url|app.opener().open_url(url,None::<&str>).map_err(|_|"browser unavailable".into())).await
}
#[tauri::command]
async fn starbase_profile()->Result<serde_json::Value,String>{
 starbase_native::Starbase::new("https://YOUR-STARBASE.workers.dev","starlab-desktop")?.get_profile().await
}

#[tauri::command]
async fn starbase_logout()->Result<(),String>{
 starbase_native::Starbase::new("https://YOUR-STARBASE.workers.dev","starlab-desktop")?.logout().await
}
