#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod detect;
mod explorer;
mod logging;
mod nilesoft;
mod nilesoft_install;
mod state;
mod terminal;
mod tray;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Err(error) = tray::setup(app.handle()) {
                eprintln!("tray setup failed: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_state,
            commands::detect_clis,
            commands::get_install_prereq_status,
            commands::launch_cli_install,
            commands::open_install_docs,
            commands::open_nodejs_download_page,
            commands::ensure_nilesoft_installed,
            commands::request_elevation_and_register,
            commands::attempt_unregister_nilesoft,
            commands::cleanup_app_data,
            commands::apply_config,
            commands::activate_now,
            commands::get_diagnostics,
            commands::get_cli_install_hints,
            commands::run_startup_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
