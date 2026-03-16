use serde::Serialize;

use crate::{
    command_launcher::RunnerKind,
    context_menu_model::{
        ContextMenuPlan, MenuGroupPlan, MenuItemPlan, ShellTarget, DEFAULT_WORKING_DIR_ARG,
        EXECLINK_MANAGED_BY, EXECLINK_OWNER, EXECLINK_SCHEMA_VERSION,
    },
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RegistryValueKind {
    Sz,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegistryValueSpec {
    pub name: Option<String>,
    pub kind: RegistryValueKind,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegistryKeySpec {
    pub path: String,
    pub values: Vec<RegistryValueSpec>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegistryWritePlan {
    pub schema_version: u32,
    pub owner: String,
    pub deletes: Vec<String>,
    pub creates: Vec<RegistryKeySpec>,
}

fn default_value(value: &str) -> RegistryValueSpec {
    RegistryValueSpec {
        name: None,
        kind: RegistryValueKind::Sz,
        data: value.to_string(),
    }
}

fn named_value(name: &str, value: impl Into<String>) -> RegistryValueSpec {
    RegistryValueSpec {
        name: Some(name.to_string()),
        kind: RegistryValueKind::Sz,
        data: value.into(),
    }
}

fn group_key_name(group_id: &str) -> String {
    format!("ExecLink.{group_id}")
}

fn child_key_name(item: &MenuItemPlan) -> String {
    format!("{:03}_{}", item.order, item.item_id)
}

fn parent_path(target: ShellTarget, group_id: &str) -> String {
    format!(
        "{}\\{}",
        target.registry_shell_root(),
        group_key_name(group_id)
    )
}

fn runner_value(runner: RunnerKind) -> &'static str {
    runner.as_str()
}

fn build_group_keys(group: &MenuGroupPlan) -> Vec<RegistryKeySpec> {
    let mut keys = Vec::new();
    for target in &group.targets {
        let parent = parent_path(*target, &group.group_id);
        keys.push(RegistryKeySpec {
            path: parent.clone(),
            values: vec![
                default_value(""),
                named_value("MUIVerb", group.title.clone()),
                // Explorer needs the empty SubCommands marker to render cascade children reliably.
                named_value("SubCommands", ""),
                named_value("Execlink.Owner", EXECLINK_OWNER),
                named_value(
                    "Execlink.SchemaVersion",
                    EXECLINK_SCHEMA_VERSION.to_string(),
                ),
                named_value("Execlink.GroupId", group.group_id.clone()),
                named_value("Execlink.GroupTitle", group.title.clone()),
                named_value("Execlink.Target", target.target_id()),
                named_value("Execlink.ManagedBy", EXECLINK_MANAGED_BY),
            ]
            .into_iter()
            .chain(
                group
                    .icon
                    .as_ref()
                    .map(|icon| named_value("Icon", icon.clone())),
            )
            .collect(),
        });
        keys.push(RegistryKeySpec {
            path: format!("{parent}\\shell"),
            values: Vec::new(),
        });
        for item in &group.items {
            let child_path = format!("{parent}\\shell\\{}", child_key_name(item));
            let command_path = format!("{child_path}\\command");
            keys.push(RegistryKeySpec {
                path: child_path,
                values: vec![
                    default_value(""),
                    named_value("MUIVerb", item.title.clone()),
                    named_value("Execlink.Owner", EXECLINK_OWNER),
                    named_value(
                        "Execlink.SchemaVersion",
                        EXECLINK_SCHEMA_VERSION.to_string(),
                    ),
                    named_value("Execlink.GroupId", group.group_id.clone()),
                    named_value("Execlink.ItemId", item.item_id.clone()),
                    named_value("Execlink.CliId", item.cli_id.clone()),
                    named_value("Execlink.Order", format!("{:03}", item.order)),
                    named_value("Execlink.Enabled", item.enabled.to_string()),
                ]
                .into_iter()
                .chain(
                    item.icon
                        .as_ref()
                        .map(|icon| named_value("Icon", icon.clone())),
                )
                .collect(),
            });
            keys.push(RegistryKeySpec {
                path: command_path,
                values: vec![
                    default_value(&item.final_command),
                    named_value("Execlink.Owner", EXECLINK_OWNER),
                    named_value(
                        "Execlink.SchemaVersion",
                        EXECLINK_SCHEMA_VERSION.to_string(),
                    ),
                    named_value("Execlink.Runner", runner_value(item.runner)),
                    named_value("Execlink.WorkingDirArg", DEFAULT_WORKING_DIR_ARG),
                    named_value("Execlink.CliCommand", item.cli_command.clone()),
                ],
            });
        }
    }
    keys
}

pub fn build_registry_write_plan(plan: &ContextMenuPlan) -> RegistryWritePlan {
    let mut deletes = Vec::new();
    let mut creates = Vec::new();

    for group in &plan.groups {
        for target in &group.targets {
            deletes.push(parent_path(*target, &group.group_id));
        }
        creates.extend(build_group_keys(group));
    }

    RegistryWritePlan {
        schema_version: plan.schema_version,
        owner: plan.owner.clone(),
        deletes,
        creates,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{context_menu_model::build_context_menu_plan, state::AppConfig};

    #[test]
    fn should_build_stable_group_key_names() {
        let plan = build_context_menu_plan(&AppConfig::default()).expect("plan");
        let registry = build_registry_write_plan(&plan);
        assert!(registry
            .creates
            .iter()
            .any(|key| key.path.ends_with("ExecLink.main")));
    }

    #[test]
    fn should_build_zero_padded_child_keys() {
        let plan = build_context_menu_plan(&AppConfig::default()).expect("plan");
        let registry = build_registry_write_plan(&plan);
        assert!(registry
            .creates
            .iter()
            .any(|key| key.path.contains("\\010_claude")));
    }

    #[test]
    fn should_not_use_menu_title_as_registry_key_name() {
        let mut config = AppConfig::default();
        config.menu_title = "Open with ExecLink".to_string();
        let plan = build_context_menu_plan(&config).expect("plan");
        let registry = build_registry_write_plan(&plan);
        assert!(registry
            .creates
            .iter()
            .all(|key| !key.path.ends_with("Open with ExecLink")));
    }

    #[test]
    fn should_write_subcommands_marker_on_each_parent_group_key() {
        let plan = build_context_menu_plan(&AppConfig::default()).expect("plan");
        let registry = build_registry_write_plan(&plan);
        let parent_keys = registry
            .creates
            .iter()
            .filter(|key| key.path.ends_with("ExecLink.main"))
            .collect::<Vec<_>>();
        assert_eq!(parent_keys.len(), 4);
        assert!(parent_keys.iter().all(|key| {
            key.values
                .iter()
                .any(|value| value.name.as_deref() == Some("SubCommands") && value.data.is_empty())
        }));
    }

    #[test]
    fn should_keep_execlink_icon_for_parent_and_brand_icon_for_child() {
        let plan = build_context_menu_plan(&AppConfig::default()).expect("plan");
        let registry = build_registry_write_plan(&plan);
        let parent = registry
            .creates
            .iter()
            .find(|key| key.path.ends_with("ExecLink.main"))
            .expect("parent key");
        let child = registry
            .creates
            .iter()
            .find(|key| key.path.contains("\\010_claude") && !key.path.ends_with("\\command"))
            .expect("child key");

        let parent_icon = parent
            .values
            .iter()
            .find(|value| value.name.as_deref() == Some("Icon"))
            .map(|value| value.data.clone())
            .unwrap_or_default();
        let child_icon = child
            .values
            .iter()
            .find(|value| value.name.as_deref() == Some("Icon"))
            .map(|value| value.data.clone())
            .unwrap_or_default();

        assert!(parent_icon.ends_with(",0"));
        assert!(child_icon
            .replace('/', "\\")
            .ends_with("context-menu-icons\\claude.ico"));
    }
}
