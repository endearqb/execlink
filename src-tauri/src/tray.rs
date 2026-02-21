use crate::{commands, logging};
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, AppHandle, Manager, Runtime};

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text("open_main", "打开主窗口")
        .text("toggle_context_menu", "开关右键菜单")
        .text("apply_config", "应用配置")
        .text("activate_now", "立即生效")
        .separator()
        .text("quit", "退出")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("execlink-tray")
        .menu(&menu)
        .tooltip("ExecLink")
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().as_ref());
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    } else {
        logging::log_line("[tray] default window icon missing, fallback to system default");
    }

    let _ = builder.build(app)?;
    logging::log_line("[tray] tray initialized");
    Ok(())
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event_id: &str) {
    match event_id {
        "open_main" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
        "toggle_context_menu" => {
            let result = commands::toggle_context_menu_and_apply();
            if result.ok {
                let activated = commands::activate_now_from_tray();
                logging::log_line(&format!(
                    "[tray] toggle context menu applied. activate ok={} code={} msg={}",
                    activated.ok, activated.code, activated.message
                ));
            } else {
                logging::log_line(&format!(
                    "[tray] toggle context menu failed code={} msg={} detail={}",
                    result.code,
                    result.message,
                    result.detail.unwrap_or_default()
                ));
            }
        }
        "apply_config" => {
            let result = commands::apply_saved_config();
            logging::log_line(&format!(
                "[tray] apply config ok={} code={} msg={}",
                result.ok, result.code, result.message
            ));
        }
        "activate_now" => {
            let result = commands::activate_now_from_tray();
            logging::log_line(&format!(
                "[tray] activate now ok={} code={} msg={}",
                result.ok, result.code, result.message
            ));
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}
