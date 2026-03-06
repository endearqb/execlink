#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod command_launcher;
mod commands;
mod context_menu_builder;
mod context_menu_icons;
mod context_menu_model;
mod context_menu_registry;
mod context_menu_service;
mod detect;
mod embedded_terminal;
mod logging;
mod process_util;
mod shell_notify;
mod state;
mod terminal;
mod tray;
mod win11_classic_menu;

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
            commands::get_cli_user_path_statuses,
            commands::add_cli_command_dir_to_user_path,
            commands::get_powershell_ps1_policy_status,
            commands::fix_powershell_ps1_policy,
            commands::launch_prereq_install,
            commands::launch_winget_install,
            commands::launch_git_install,
            commands::launch_nodejs_install,
            commands::launch_cli_install,
            commands::launch_cli_auth,
            commands::verify_kimi_installation,
            commands::verify_kimi_python_installation,
            commands::run_cli_verify,
            commands::launch_cli_uninstall,
            commands::open_install_docs,
            commands::open_nodejs_download_page,
            commands::open_winget_install_page,
            commands::terminal_ensure_session,
            commands::terminal_input,
            commands::terminal_run_script,
            commands::terminal_resize,
            commands::terminal_close_session,
            commands::cleanup_app_data,
            commands::preview_context_menu_plan,
            commands::list_execlink_context_menus,
            commands::remove_all_execlink_context_menus,
            commands::notify_shell_changed,
            commands::restart_explorer_fallback,
            commands::detect_legacy_menu_artifacts,
            commands::migrate_legacy_hkcu_menu_to_v2,
            commands::cleanup_nilesoft_artifacts,
            commands::enable_win11_classic_context_menu,
            commands::disable_win11_classic_context_menu,
            commands::apply_config,
            commands::get_diagnostics,
            commands::get_cli_install_hints,
            commands::run_startup_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
