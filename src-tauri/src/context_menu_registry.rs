use std::collections::{BTreeMap, BTreeSet};

use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_READ},
    RegKey,
};

use crate::{
    context_menu_builder::{RegistryKeySpec, RegistryValueSpec, RegistryWritePlan},
    context_menu_model::{ShellTarget, EXECLINK_OWNER, EXECLINK_SCHEMA_VERSION},
    state::{AppResult, InstalledMenuGroup, LegacyArtifact},
};

fn hkcu() -> RegKey {
    RegKey::predef(HKEY_CURRENT_USER)
}

fn supported_targets() -> [ShellTarget; 4] {
    [
        ShellTarget::DirectoryBackground,
        ShellTarget::Directory,
        ShellTarget::DesktopBackground,
        ShellTarget::Drive,
    ]
}

fn full_hkcu_path(path: &str) -> String {
    format!(r"HKCU\{path}")
}

fn read_optional_string(key: &RegKey, name: &str) -> Option<String> {
    key.get_value::<String, _>(name).ok()
}

fn read_default_string(key: &RegKey) -> Option<String> {
    key.get_value::<String, _>("").ok()
}

fn key_exists(path: &str) -> bool {
    hkcu().open_subkey_with_flags(path, KEY_READ).is_ok()
}

fn set_registry_value(key: &RegKey, value: &RegistryValueSpec) -> AppResult<()> {
    let name = value.name.as_deref().unwrap_or("");
    key.set_value(name, &value.data)
        .map_err(|error| format!("写入注册表值失败 {}: {error}", name))?;
    Ok(())
}

fn create_key(key_spec: &RegistryKeySpec) -> AppResult<()> {
    let (key, _) = hkcu()
        .create_subkey(&key_spec.path)
        .map_err(|error| format!("创建注册表项失败 {}: {error}", full_hkcu_path(&key_spec.path)))?;
    for value in &key_spec.values {
        set_registry_value(&key, value)?;
    }
    Ok(())
}

fn owner_matches(path: &str) -> AppResult<bool> {
    let key = hkcu()
        .open_subkey_with_flags(path, KEY_READ)
        .map_err(|error| format!("打开注册表项失败 {}: {error}", full_hkcu_path(path)))?;
    Ok(matches!(
        read_optional_string(&key, "Execlink.Owner").as_deref(),
        Some(EXECLINK_OWNER)
    ))
}

pub fn delete_tree_if_owned(path: &str) -> AppResult<bool> {
    if !key_exists(path) {
        return Ok(false);
    }
    if !owner_matches(path)? {
        return Err(format!(
            "拒绝删除未标记为 ExecLink 所有者的注册表项: {}",
            full_hkcu_path(path)
        ));
    }
    hkcu()
        .delete_subkey_all(path)
        .map_err(|error| format!("删除注册表项失败 {}: {error}", full_hkcu_path(path)))?;
    Ok(true)
}

pub fn delete_tree_force(path: &str) -> AppResult<bool> {
    if !key_exists(path) {
        return Ok(false);
    }
    hkcu()
        .delete_subkey_all(path)
        .map_err(|error| format!("删除注册表项失败 {}: {error}", full_hkcu_path(path)))?;
    Ok(true)
}

pub fn apply_registry_write_plan(plan: &RegistryWritePlan) -> AppResult<()> {
    let mut deleted = BTreeSet::new();
    for path in &plan.deletes {
        if deleted.insert(path.clone()) {
            let _ = delete_tree_if_owned(path)?;
        }
    }
    for key_spec in &plan.creates {
        create_key(key_spec)?;
    }
    Ok(())
}

pub fn verify_registry_write_plan(plan: &RegistryWritePlan) -> AppResult<()> {
    for key_spec in &plan.creates {
        let key = hkcu()
            .open_subkey_with_flags(&key_spec.path, KEY_READ)
            .map_err(|error| format!("验证注册表项失败 {}: {error}", full_hkcu_path(&key_spec.path)))?;
        for value in &key_spec.values {
            let name = value.name.as_deref().unwrap_or("");
            let actual = if name.is_empty() {
                read_default_string(&key)
            } else {
                read_optional_string(&key, name)
            };
            if actual.as_deref() != Some(value.data.as_str()) {
                return Err(format!(
                    "验证注册表值失败 {}\\{}，期望={}，实际={:?}",
                    full_hkcu_path(&key_spec.path),
                    if name.is_empty() { "(Default)" } else { name },
                    value.data,
                    actual
                ));
            }
        }
    }
    Ok(())
}

fn read_item_ids(parent_key: &RegKey) -> Vec<String> {
    let Ok(shell_key) = parent_key.open_subkey_with_flags("shell", KEY_READ) else {
        return Vec::new();
    };
    shell_key
        .enum_keys()
        .flatten()
        .filter_map(|child_name| {
            let Ok(child_key) = shell_key.open_subkey_with_flags(&child_name, KEY_READ) else {
                return None;
            };
            match read_optional_string(&child_key, "Execlink.Owner").as_deref() {
                Some(EXECLINK_OWNER) => read_optional_string(&child_key, "Execlink.ItemId"),
                _ => None,
            }
        })
        .collect()
}

pub fn list_installed_menu_groups() -> AppResult<Vec<InstalledMenuGroup>> {
    let mut grouped: BTreeMap<String, InstalledMenuGroup> = BTreeMap::new();
    let schema_version = EXECLINK_SCHEMA_VERSION.to_string();
    for target in supported_targets() {
        let root = hkcu()
            .open_subkey_with_flags(target.registry_shell_root(), KEY_READ)
            .ok();
        let Some(root) = root else {
            continue;
        };
        for key_name in root.enum_keys().flatten() {
            let Ok(group_key) = root.open_subkey_with_flags(&key_name, KEY_READ) else {
                continue;
            };
            if read_optional_string(&group_key, "Execlink.Owner").as_deref() != Some(EXECLINK_OWNER) {
                continue;
            }
            if read_optional_string(&group_key, "Execlink.SchemaVersion").as_deref()
                != Some(schema_version.as_str())
            {
                continue;
            }
            let group_id =
                read_optional_string(&group_key, "Execlink.GroupId").unwrap_or_else(|| key_name.clone());
            let title = read_optional_string(&group_key, "Execlink.GroupTitle")
                .or_else(|| read_optional_string(&group_key, "MUIVerb"))
                .unwrap_or_else(|| group_id.clone());
            let entry = grouped
                .entry(group_id.clone())
                .or_insert_with(|| InstalledMenuGroup {
                    group_id: group_id.clone(),
                    title: title.clone(),
                    roots: Vec::new(),
                    item_ids: Vec::new(),
                    schema_version: EXECLINK_SCHEMA_VERSION,
                });
            if !entry.roots.iter().any(|root_id| root_id == target.target_id()) {
                entry.roots.push(target.target_id().to_string());
            }
            for item_id in read_item_ids(&group_key) {
                if !entry.item_ids.iter().any(|existing| existing == &item_id) {
                    entry.item_ids.push(item_id);
                }
            }
            if entry.title.trim().is_empty() {
                entry.title = title;
            }
        }
    }
    Ok(grouped.into_values().collect())
}

fn legacy_candidate_reason(commands: &str) -> Option<String> {
    let lower = commands.to_ascii_lowercase();
    let has_cli = ["claude", "codex", "gemini", "kimi", "qwen", "opencode"]
        .iter()
        .any(|token| lower.contains(token));
    let has_workdir = lower.contains("set-location -literalpath ''%v'';");
    let has_marker = has_workdir
        || ["execlink", "exelink", "ai-cli-switch"]
            .iter()
            .any(|token| lower.contains(token));
    if has_cli && has_marker {
        Some("matched_v1_heuristic".to_string())
    } else {
        None
    }
}

fn collect_legacy_commands(base_key: &RegKey) -> Vec<String> {
    let Ok(shell_key) = base_key.open_subkey_with_flags("shell", KEY_READ) else {
        return Vec::new();
    };
    let mut commands = Vec::new();
    for child_name in shell_key.enum_keys().flatten() {
        let Ok(child_key) = shell_key.open_subkey_with_flags(&child_name, KEY_READ) else {
            continue;
        };
        let Ok(command_key) = child_key.open_subkey_with_flags("command", KEY_READ) else {
            continue;
        };
        if let Some(command) = read_default_string(&command_key) {
            commands.push(command);
        }
    }
    commands
}

pub fn detect_legacy_artifacts() -> AppResult<Vec<LegacyArtifact>> {
    let mut artifacts = Vec::new();
    for target in supported_targets() {
        let root_path = target.registry_shell_root();
        let Ok(root) = hkcu().open_subkey_with_flags(root_path, KEY_READ) else {
            continue;
        };
        for key_name in root.enum_keys().flatten() {
            let Ok(base_key) = root.open_subkey_with_flags(&key_name, KEY_READ) else {
                continue;
            };
            if read_optional_string(&base_key, "Execlink.Owner").is_some() {
                continue;
            }
            let commands = collect_legacy_commands(&base_key);
            if commands.is_empty() {
                continue;
            }
            let joined = commands.join("\n");
            let Some(reason) = legacy_candidate_reason(&joined) else {
                continue;
            };
            let title = read_optional_string(&base_key, "MUIVerb").unwrap_or_else(|| key_name.clone());
            artifacts.push(LegacyArtifact {
                path: format!(r"{}\{}", full_hkcu_path(root_path), key_name),
                title,
                root: target.target_id().to_string(),
                reason,
            });
        }
    }
    Ok(artifacts)
}

pub fn remove_all_v2_groups() -> AppResult<usize> {
    let groups = list_installed_menu_groups()?;
    let mut removed = 0usize;
    for group in &groups {
        for target in supported_targets() {
            let path = format!(
                "{}\\ExecLink.{}",
                target.registry_shell_root(),
                group.group_id
            );
            if delete_tree_if_owned(&path).unwrap_or(false) {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

pub fn remove_explicit_paths(paths: &[String]) -> AppResult<usize> {
    let mut removed = 0usize;
    for path in paths {
        let relative = path.strip_prefix("HKCU\\").unwrap_or(path);
        if delete_tree_force(relative)? {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_detect_legacy_heuristic_from_v1_command() {
        let reason = legacy_candidate_reason(
            "pwsh.exe -NoExit -ExecutionPolicy Bypass -Command \"Set-Location -LiteralPath ''%V''; claude\"",
        );
        assert_eq!(reason.as_deref(), Some("matched_v1_heuristic"));
    }

    #[test]
    fn should_ignore_non_execlink_commands_for_legacy_detection() {
        assert!(legacy_candidate_reason("cmd /c echo hello").is_none());
    }
}
