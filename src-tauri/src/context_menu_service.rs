use serde::Serialize;

use crate::{
    context_menu_builder::{build_registry_write_plan, RegistryWritePlan},
    context_menu_icons,
    context_menu_model::{
        build_context_menu_plan, filter_config_by_detected_clis, ContextMenuPlan,
    },
    context_menu_registry, detect, shell_notify,
    state::{self, AppConfig, AppResult, ContextMenuStatus, InstalledMenuGroup, LegacyArtifact},
};

#[derive(Debug, Clone, Serialize)]
pub struct ContextMenuApplyReport {
    pub removed_paths: usize,
    pub written_keys: usize,
    pub group_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct MigrationReport {
    pub migrated_legacy_paths: usize,
    pub written_keys: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanupSummary {
    pub removed_registry_paths: usize,
    pub removed_runtime_dirs: usize,
}

fn build_effective_context_menu_plan(config: &AppConfig) -> AppResult<ContextMenuPlan> {
    let detected = detect::detect_all_clis();
    let filtered = filter_config_by_detected_clis(config, &detected);
    build_context_menu_plan(&filtered)
}

pub fn preview_registry_write_plan(config: &AppConfig) -> AppResult<RegistryWritePlan> {
    let plan = build_effective_context_menu_plan(config)?;
    Ok(build_registry_write_plan(&plan))
}

pub fn list_installed_menu_groups() -> AppResult<Vec<InstalledMenuGroup>> {
    context_menu_registry::list_installed_menu_groups()
}

pub fn detect_legacy_artifacts() -> AppResult<Vec<LegacyArtifact>> {
    context_menu_registry::detect_legacy_artifacts()
}

pub fn inspect_context_menu_status() -> AppResult<ContextMenuStatus> {
    let groups = list_installed_menu_groups()?;
    let legacy = detect_legacy_artifacts()?;
    if groups.is_empty() {
        return Ok(ContextMenuStatus {
            applied: false,
            enabled_roots: Vec::new(),
            has_legacy_artifacts: !legacy.is_empty(),
            requires_manual_refresh: false,
            current_group_id: None,
            current_group_title: None,
            message: if legacy.is_empty() {
                "尚未应用 ExecLink v2 右键菜单".to_string()
            } else {
                format!("检测到 {} 个 legacy 菜单残留，建议迁移", legacy.len())
            },
        });
    }

    let mut roots = groups
        .iter()
        .flat_map(|group| group.roots.iter().cloned())
        .collect::<Vec<_>>();
    roots.sort();
    roots.dedup();
    let first = &groups[0];
    Ok(ContextMenuStatus {
        applied: true,
        enabled_roots: roots,
        has_legacy_artifacts: !legacy.is_empty(),
        requires_manual_refresh: false,
        current_group_id: Some(first.group_id.clone()),
        current_group_title: Some(first.title.clone()),
        message: if legacy.is_empty() {
            format!(
                "已应用 ExecLink v2 右键菜单（{} 个作用域）",
                first.roots.len()
            )
        } else {
            format!(
                "已应用 ExecLink v2 右键菜单，同时检测到 {} 个 legacy 菜单残留",
                legacy.len()
            )
        },
    })
}

pub fn apply_context_menu(config: &AppConfig) -> AppResult<ContextMenuApplyReport> {
    let plan = preview_registry_write_plan(config)?;
    if plan.creates.is_empty() {
        let removed_paths = context_menu_registry::remove_all_v2_groups()?;
        shell_notify::notify_shell_changed()?;
        return Ok(ContextMenuApplyReport {
            removed_paths,
            written_keys: 0,
            group_count: 0,
        });
    }

    context_menu_icons::ensure_context_menu_icon_files()?;
    let removed_paths = plan.deletes.len();
    context_menu_registry::apply_registry_write_plan(&plan)?;
    if let Err(error) = context_menu_registry::verify_registry_write_plan(&plan) {
        let _ = context_menu_registry::remove_all_v2_groups();
        return Err(error);
    }
    shell_notify::notify_shell_changed()?;
    Ok(ContextMenuApplyReport {
        removed_paths,
        written_keys: plan.creates.len(),
        group_count: plan
            .creates
            .iter()
            .filter(|key| key.path.ends_with("ExecLink.main"))
            .count(),
    })
}

pub fn migrate_legacy_to_v2(config: &AppConfig) -> AppResult<MigrationReport> {
    let legacy = detect_legacy_artifacts()?;
    let plan = preview_registry_write_plan(config)?;
    context_menu_icons::ensure_context_menu_icon_files()?;
    context_menu_registry::apply_registry_write_plan(&plan)?;
    if let Err(error) = context_menu_registry::verify_registry_write_plan(&plan) {
        let _ = context_menu_registry::remove_all_v2_groups();
        return Err(error);
    }
    if let Err(error) = shell_notify::notify_shell_changed() {
        let _ = context_menu_registry::remove_all_v2_groups();
        return Err(error);
    }
    let legacy_paths = legacy
        .iter()
        .map(|artifact| artifact.path.clone())
        .collect::<Vec<_>>();
    let migrated_legacy_paths = context_menu_registry::remove_explicit_paths(&legacy_paths)?;
    Ok(MigrationReport {
        migrated_legacy_paths,
        written_keys: plan.creates.len(),
    })
}

pub fn remove_all_context_menus() -> AppResult<usize> {
    let legacy_paths = detect_legacy_artifacts()?
        .into_iter()
        .map(|artifact| artifact.path)
        .collect::<Vec<_>>();
    let removed_v2 = context_menu_registry::remove_all_v2_groups()?;
    let removed_legacy = context_menu_registry::remove_explicit_paths(&legacy_paths)?;
    shell_notify::notify_shell_changed()?;
    Ok(removed_v2 + removed_legacy)
}

pub fn cleanup_nilesoft_artifacts() -> AppResult<CleanupSummary> {
    let mut removed_runtime_dirs = 0usize;
    let nilesoft_root = state::nilesoft_root_dir()?;
    if nilesoft_root.exists() {
        std::fs::remove_dir_all(&nilesoft_root).map_err(|error| {
            format!(
                "删除旧 Nilesoft 目录失败 {}: {error}",
                nilesoft_root.display()
            )
        })?;
        removed_runtime_dirs += 1;
    }
    let removed_registry_paths = remove_all_context_menus()?;
    Ok(CleanupSummary {
        removed_registry_paths,
        removed_runtime_dirs,
    })
}
