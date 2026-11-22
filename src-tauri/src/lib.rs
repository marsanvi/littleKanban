pub mod storage;

#[tauri::command]
fn read_project(path: String) -> Result<String, String> {
    storage::read_project(std::path::Path::new(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_project(
    path: String,
    contents: String,
    previous: Option<String>,
) -> Result<String, String> {
    storage::write_project(std::path::Path::new(&path), &contents, previous.as_deref())
        .map_err(|error| error.to_string())?;
    Ok(contents)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_project, write_project])
        .run(tauri::generate_context!())
        .expect("error while running littleKanban");
}
