# Context Menu Registry Schema v2

**Project:** ExecLink  
**Document type:** Direct-to-code registry specification  
**Target platform:** Windows 10/11 File Explorer classic context menu  
**Applies to:** Rust + Tauri backend, per-user installation (`HKCU`)  
**Status:** Proposed v2 schema

---

## 1. Scope and boundary

This schema defines a **Nilesoft-free**, **HKCU-only**, **Rust-writable** registry layout for ExecLink’s File Explorer context menu integration.

This v2 schema is intentionally scoped to:

- classic registry-based Explorer context menus
- per-user install without elevation
- cascaded menu with child CLI commands
- deterministic ownership, listing, update, and cleanup
- safe migration from the current PowerShell-generated HKCU menu layout

This v2 schema is **not** intended to place ExecLink into the **Windows 11 modern top-level compact context menu**. For that path, Microsoft requires `IExplorerCommand` and package identity at runtime.

---

## 2. Normative references (Microsoft)

These links should be treated as the normative platform references for the implementation.

1. Creating shortcut menu handlers  
   https://learn.microsoft.com/en-us/windows/win32/shell/context-menu-handlers

2. Verbs and file associations  
   https://learn.microsoft.com/en-us/windows/win32/shell/fa-verbs

3. SHChangeNotify  
   https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shchangenotify

4. Windows application development best practices  
   https://learn.microsoft.com/en-us/windows/apps/get-started/best-practices

5. IExplorerCommand interface  
   https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-iexplorercommand

6. Registering shell extension handlers  
   https://learn.microsoft.com/en-us/windows/win32/shell/reg-shell-exts

---

## 3. Platform conclusions that drive this schema

### 3.1 Why HKCU is enough

Microsoft documents that `HKEY_CLASSES_ROOT` is a merged view of `HKLM\Software\Classes` and `HKCU\Software\Classes`. For custom verbs that do not need elevation, registering under `HKCU\Software\Classes` is the preferred lightweight route.

### 3.2 Why this schema uses classic static verbs

ExecLink’s needs are straightforward:

- a fixed parent menu
- a small set of child launch commands
- no COM shell extension logic
- no package identity requirement

That fits the classic registry-based menu model well.

### 3.3 Why this schema does **not** target the Windows 11 modern top-level menu

Microsoft’s current guidance is explicit:

- to appear in the new Windows 11 top-level context menu, an extension must use `IExplorerCommand`
- the app must have package identity at runtime

So the v2 registry schema is for the classic menu path only.

---

## 4. Design principles

### 4.1 Stable key names, mutable display names

**v1 problem:** the current implementation effectively uses the menu title as the registry key name. That makes rename operations fragile and creates duplicate/stale keys when the display title changes.

**v2 rule:**

- registry key names are **stable internal IDs**
- visible labels are stored only in `MUIVerb`

### 4.2 Explicit ownership markers

Every ExecLink-owned parent key and child item key must carry internal marker values so that Rust code can:

- list only ExecLink-owned entries
- distinguish v2 from legacy v1
- safely remove only its own keys
- avoid deleting foreign menu entries

### 4.3 HKCU-only, no admin requirement

All v2 writes target `HKCU\Software\Classes\...`.

### 4.4 Idempotent apply

Applying the same configuration twice must result in the same registry tree.

### 4.5 Safe delete

Delete only keys that contain the ExecLink ownership marker, or that match the legacy v1 migration heuristics described later.

### 4.6 Refresh Explorer without depending on Explorer restart first

Preferred refresh order:

1. `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL)`
2. final fallback: kill/restart `explorer.exe`

---

## 5. Supported shell object targets

ExecLink currently needs context menu coverage for these object targets:

| Target | Registry root |
|---|---|
| Directory background | `HKCU\Software\Classes\Directory\Background\shell` |
| Directory | `HKCU\Software\Classes\Directory\shell` |
| Desktop background | `HKCU\Software\Classes\DesktopBackground\shell` |
| Drive | `HKCU\Software\Classes\Drive\shell` |

### 5.1 Target identifiers used inside ExecLink

Use these stable internal target IDs in Rust:

- `directory_background`
- `directory`
- `desktop_background`
- `drive`

---

## 6. Naming rules

### 6.1 Group key ID

Each menu group must have a stable **group ID**.

**Regex:**

```text
^[a-z0-9][a-z0-9._-]{0,63}$
```

**Recommended default:**

```text
main
```

### 6.2 Parent registry key name

Parent registry key names must follow:

```text
ExecLink.{group_id}
```

Examples:

- `ExecLink.main`
- `ExecLink.devtools`
- `ExecLink.team-a`

### 6.3 Child item key name

Child item registry key names must follow:

```text
{order:03}_{item_id}
```

Examples:

- `010_claude`
- `020_codex`
- `030_kimi`

This guarantees deterministic ordering and readable keys.

### 6.4 Item ID

**Regex:**

```text
^[a-z0-9][a-z0-9._-]{0,63}$
```

**Recommended built-in values:**

- `claude`
- `codex`
- `gemini`
- `kimi`
- `kimi_web`
- `qwencode`
- `opencode`

---

## 7. Registry topology

For each enabled shell target, ExecLink writes one parent menu key plus one child key per enabled CLI.

### 7.1 Parent key path pattern

```text
HKCU\Software\Classes\{shell_root}\ExecLink.{group_id}
```

Example for directory background:

```text
HKCU\Software\Classes\Directory\Background\shell\ExecLink.main
```

### 7.2 Child key path pattern

```text
HKCU\Software\Classes\{shell_root}\ExecLink.{group_id}\shell\{order:03}_{item_id}
```

### 7.3 Command key path pattern

```text
HKCU\Software\Classes\{shell_root}\ExecLink.{group_id}\shell\{order:03}_{item_id}\command
```

---

## 8. Parent key schema

The parent key represents the visible cascade entry, for example “Open with ExecLink”.

### 8.1 Required values on parent key

| Value name | Type | Required | Meaning | Example |
|---|---|---:|---|---|
| `(Default)` | `REG_SZ` | Yes | Must be empty string | `""` |
| `MUIVerb` | `REG_SZ` | Yes | Visible parent menu title | `Open with ExecLink` |
| `Icon` | `REG_SZ` | No | Parent icon resource | `C:\\Users\\me\\AppData\\Local\\Programs\\ExecLink\\ExecLink.exe,0` |
| `Execlink.Owner` | `REG_SZ` | Yes | Ownership marker | `endearqb.execlink` |
| `Execlink.SchemaVersion` | `REG_SZ` | Yes | Schema version marker | `2` |
| `Execlink.GroupId` | `REG_SZ` | Yes | Stable logical group ID | `main` |
| `Execlink.GroupTitle` | `REG_SZ` | Yes | User-visible title snapshot | `Open with ExecLink` |
| `Execlink.Target` | `REG_SZ` | Yes | Internal target ID | `directory_background` |
| `Execlink.ManagedBy` | `REG_SZ` | Yes | Writer identity | `rust-registry-v2` |

### 8.2 Optional values on parent key

| Value name | Type | Required | Meaning | Example |
|---|---|---:|---|---|
| `Position` | `REG_SZ` | No | Explorer placement hint | `Top` |
| `CommandFlags` | `REG_DWORD` | No | Optional shell flags | `0x00000020` |
| `SubCommands` | `REG_SZ` | Yes | Explorer cascade compatibility marker; must be empty string | `""` |

### 8.3 Parent subkeys

| Subkey | Required | Meaning |
|---|---:|---|
| `shell` | Yes | Holds child menu item keys |

### 8.4 Parent key example

```reg
[HKEY_CURRENT_USER\Software\Classes\Directory\Background\shell\ExecLink.main]
@=""
"MUIVerb"="Open with ExecLink"
"Icon"="C:\\Users\\me\\AppData\\Local\\Programs\\ExecLink\\ExecLink.exe,0"
"SubCommands"=""
"Execlink.Owner"="endearqb.execlink"
"Execlink.SchemaVersion"="2"
"Execlink.GroupId"="main"
"Execlink.GroupTitle"="Open with ExecLink"
"Execlink.Target"="directory_background"
"Execlink.ManagedBy"="rust-registry-v2"
```

---

## 9. Child item key schema

Each child item represents one CLI launcher entry.

### 9.1 Required values on child item key

| Value name | Type | Required | Meaning | Example |
|---|---|---:|---|---|
| `(Default)` | `REG_SZ` | Yes | Must be empty string | `""` |
| `MUIVerb` | `REG_SZ` | Yes | Visible item title | `Claude Code` |
| `Execlink.Owner` | `REG_SZ` | Yes | Ownership marker | `endearqb.execlink` |
| `Execlink.SchemaVersion` | `REG_SZ` | Yes | Schema version marker | `2` |
| `Execlink.GroupId` | `REG_SZ` | Yes | Parent group ID | `main` |
| `Execlink.ItemId` | `REG_SZ` | Yes | Stable item ID | `claude` |
| `Execlink.CliId` | `REG_SZ` | Yes | CLI logical ID | `claude` |
| `Execlink.Order` | `REG_SZ` | Yes | Zero-padded order | `010` |
| `Execlink.Enabled` | `REG_SZ` | Yes | For diagnostics only; registry writer only emits enabled items | `true` |

### 9.2 Optional values on child item key

| Value name | Type | Required | Meaning | Example |
|---|---|---:|---|---|
| `Icon` | `REG_SZ` | No | Item icon resource | `C:\\Users\\me\\AppData\\Local\\Programs\\ExecLink\\ExecLink.exe,0` |
| `CommandFlags` | `REG_DWORD` | No | Optional shell flags | `0x00000000` |
| `SeparatorBefore` | `REG_SZ` | No | App-level metadata only | `false` |
| `SeparatorAfter` | `REG_SZ` | No | App-level metadata only | `false` |

### 9.3 Child subkeys

| Subkey | Required | Meaning |
|---|---:|---|
| `command` | Yes | Holds the command string in `(Default)` |

### 9.4 Child item example

```reg
[HKEY_CURRENT_USER\Software\Classes\Directory\Background\shell\ExecLink.main\shell\010_claude]
@=""
"MUIVerb"="Claude Code"
"Icon"="C:\\Users\\me\\AppData\\Local\\Programs\\ExecLink\\ExecLink.exe,0"
"Execlink.Owner"="endearqb.execlink"
"Execlink.SchemaVersion"="2"
"Execlink.GroupId"="main"
"Execlink.ItemId"="claude"
"Execlink.CliId"="claude"
"Execlink.Order"="010"
"Execlink.Enabled"="true"
```

---

## 10. Command key schema

The `command` subkey contains the actual process launch command used by Explorer.

### 10.1 Required values on command key

| Value name | Type | Required | Meaning | Example |
|---|---|---:|---|---|
| `(Default)` | `REG_SZ` | Yes | Full launch command | `pwsh.exe -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath ''%V''; claude"` |
| `Execlink.Owner` | `REG_SZ` | Yes | Ownership marker | `endearqb.execlink` |
| `Execlink.SchemaVersion` | `REG_SZ` | Yes | Schema version marker | `2` |
| `Execlink.Runner` | `REG_SZ` | Yes | Launch runner kind | `pwsh` |
| `Execlink.WorkingDirArg` | `REG_SZ` | Yes | Placeholder convention used by ExecLink | `%V` |

### 10.2 Optional values on command key

| Value name | Type | Required | Meaning | Example |
|---|---|---:|---|---|
| `Execlink.CommandTemplate` | `REG_SZ` | No | Human-readable template | `{shell} -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath ''%V''; {cmd}"` |
| `Execlink.CliCommand` | `REG_SZ` | No | Raw CLI command | `claude` |
| `Execlink.TerminalProfile` | `REG_SZ` | No | Optional runner metadata | `PowerShell 7` |

---

## 11. Recommended command-string rules

### 11.1 Current-compatible direct PowerShell runner

Use this when the menu should open directly in PowerShell or PowerShell 7.

#### pwsh example

```text
pwsh.exe -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath ''%V''; claude"
```

#### Windows PowerShell example

```text
powershell.exe -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath ''%V''; claude"
```

### 11.2 Windows Terminal runner

Use this when ExecLink chooses `wt.exe` as the shell runner.

```text
wt.exe -d "%V" pwsh.exe -NoExit -ExecutionPolicy Bypass -Command "claude"
```

### 11.3 Quoting rules

1. Any path containing spaces must be quoted.
2. The final registry command string must be stored exactly as Explorer should execute it.
3. Rust should generate the fully materialized command string; Explorer should not depend on extra wrapper scripts unless explicitly configured.
4. Writer code must avoid lossy quote normalization.

### 11.4 Working-directory placeholder rule

For folder/background style launches, ExecLink v2 continues to use `%V` as the working-directory placeholder convention for compatibility with the current project behavior.

---

## 12. Canonical registry tree example

This example shows one fully materialized v2 entry for the directory background target.

```text
HKCU
└─ Software
   └─ Classes
      └─ Directory
         └─ Background
            └─ shell
               └─ ExecLink.main
                  ├─ (Default) = ""
                  ├─ MUIVerb = "Open with ExecLink"
                  ├─ Icon = "C:\\Users\\me\\AppData\\Local\\Programs\\ExecLink\\ExecLink.exe,0"
                  ├─ Execlink.Owner = "endearqb.execlink"
                  ├─ Execlink.SchemaVersion = "2"
                  ├─ Execlink.GroupId = "main"
                  ├─ Execlink.GroupTitle = "Open with ExecLink"
                  ├─ Execlink.Target = "directory_background"
                  ├─ Execlink.ManagedBy = "rust-registry-v2"
                  └─ shell
                     ├─ 010_claude
                     │  ├─ (Default) = ""
                     │  ├─ MUIVerb = "Claude Code"
                     │  ├─ Execlink.Owner = "endearqb.execlink"
                     │  ├─ Execlink.SchemaVersion = "2"
                     │  ├─ Execlink.GroupId = "main"
                     │  ├─ Execlink.ItemId = "claude"
                     │  ├─ Execlink.CliId = "claude"
                     │  ├─ Execlink.Order = "010"
                     │  ├─ Execlink.Enabled = "true"
                     │  └─ command
                     │     ├─ (Default) = "pwsh.exe -NoExit -ExecutionPolicy Bypass -Command \"Set-Location -LiteralPath ''%V''; claude\""
                     │     ├─ Execlink.Owner = "endearqb.execlink"
                     │     ├─ Execlink.SchemaVersion = "2"
                     │     ├─ Execlink.Runner = "pwsh"
                     │     └─ Execlink.WorkingDirArg = "%V"
                     └─ 020_codex
                        └─ ...
```

---

## 13. Rust-side data model that this schema expects

This is the recommended in-memory model to compile into the registry tree.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuPlan {
    pub schema_version: u32,          // must be 2
    pub owner: String,                // "endearqb.execlink"
    pub groups: Vec<MenuGroupPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuGroupPlan {
    pub group_id: String,             // e.g. "main"
    pub title: String,                // e.g. "Open with ExecLink"
    pub icon: Option<String>,
    pub targets: Vec<ShellTarget>,
    pub items: Vec<MenuItemPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItemPlan {
    pub item_id: String,              // e.g. "claude"
    pub cli_id: String,               // e.g. "claude"
    pub title: String,                // e.g. "Claude Code"
    pub order: u16,                   // 10, 20, 30 ...
    pub enabled: bool,
    pub icon: Option<String>,
    pub runner: RunnerKind,
    pub cli_command: String,          // e.g. "claude"
    pub final_command: String,        // fully compiled registry string
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ShellTarget {
    DirectoryBackground,
    Directory,
    DesktopBackground,
    Drive,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum RunnerKind {
    Pwsh,
    WindowsPowerShell,
    WindowsTerminal,
}
```

---

## 14. Write algorithm (normative)

For each enabled target root:

1. Compute stable parent key name: `ExecLink.{group_id}`
2. Open or create parent key
3. Write all required parent values
4. Ensure `shell` subkey exists
5. Enumerate current child keys under `shell`
6. Delete only child keys carrying `Execlink.Owner=endearqb.execlink`
7. Recreate child keys from the current in-memory order
8. For each child, create `command` subkey and write full command string
9. After all roots succeed, call `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL)`
10. If shell UI does not refresh, invoke Explorer restart fallback

### 14.1 Important writer rule

The writer must never use the visible title as the key name.

### 14.2 Important delete rule

The writer must never recursively delete an unmarked parent key unless it is in explicit legacy-migration cleanup mode.

---

## 15. Read/list algorithm (normative)

### 15.1 v2 discovery rule

A parent key is considered v2 ExecLink-owned only if all of the following are true:

- `Execlink.Owner == endearqb.execlink`
- `Execlink.SchemaVersion == 2`
- key name matches `ExecLink.{group_id}`

### 15.2 v2 child discovery rule

A child key is considered v2 ExecLink-owned only if:

- child key contains `Execlink.Owner == endearqb.execlink`
- command subkey exists
- command subkey contains `Execlink.Owner == endearqb.execlink`

### 15.3 Cross-root merge rule

When listing groups in the UI, merge parent keys that share the same `group_id` across targets.

Suggested grouping key:

```text
group_id + owner + schema_version
```

---

## 16. Remove algorithm (normative)

### 16.1 Remove one v2 group

For each supported target root:

1. Locate `HKCU\Software\Classes\{root}\ExecLink.{group_id}`
2. Verify `Execlink.Owner == endearqb.execlink`
3. Delete the full parent tree
4. Call `SHChangeNotify`

### 16.2 Remove all v2 groups

Enumerate all supported target roots and delete only parents satisfying the v2 discovery rule.

---

## 17. Migration compatibility rules

This section is critical because the current ExecLink repository already has a working HKCU PowerShell-based menu writer.

### 17.1 Observed v1 characteristics

The current implementation writes to:

- `HKCU\Software\Classes\Directory\Background\shell`
- `HKCU\Software\Classes\Directory\shell`
- `HKCU\Software\Classes\DesktopBackground\shell`
- `HKCU\Software\Classes\Drive\shell`

And it currently:

- uses the visible menu title as the parent key name
- writes `MUIVerb = <menu name>`
- writes `Icon = powershell.exe,0`
- writes `SubCommands = ""`
- creates child keys like `01.item`, `02.item`, ...
- stores commands of the form:  
  `pwsh.exe|powershell.exe -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath ''%V''; {cli}"`

### 17.2 Legacy v1 detection heuristic

A parent key should be considered **candidate v1** if:

1. it exists under one of the four supported target roots
2. it has a `shell` subkey
3. at least one child command contains both:
   - a CLI token such as `claude|codex|gemini|kimi|qwen|opencode`
   - the marker `Set-Location -LiteralPath ''%V'';`

Optional extra heuristic:

- command contains `ExecLink`, `ExeLink`, `AI-CLI-Switch`, or `execlink`

### 17.3 v1 → v2 migration rule

On first v2 apply:

1. enumerate candidate v1 entries across all supported roots
2. compute the target v2 key name, typically `ExecLink.main`
3. write v2 keys first
4. verify all expected v2 parent roots exist
5. verify each expected v2 parent has at least one valid child command
6. call `SHChangeNotify`
7. only then delete matching v1 parent keys

### 17.4 Rename compatibility rule

If the user changes the visible title, do **not** create a new parent key. Only update `MUIVerb` and `Execlink.GroupTitle`.

### 17.5 Ordering compatibility rule

v1 child keys like `01.item`, `02.item` must be normalized to v2 child keys like:

- `010_claude`
- `020_codex`
- `030_kimi`

### 17.6 `SubCommands` compatibility rule

The v2 writer must write `SubCommands=""` on every parent key to keep Explorer’s cascade rendering stable.

Additionally:

- v2 reader should tolerate its presence
- v2 migrator may preserve or rewrite it as empty string
- v2 remover should ignore it

### 17.7 Rollback safety rule

If v2 write fails partway through:

- do not delete v1 keys
- delete any partially written v2 keys that contain the v2 owner marker
- return a structured error to the frontend

---

## 18. Recommended Rust implementation notes

### 18.1 Registry access

Recommended approach:

- use `winreg` for registry CRUD
- use `windows` crate for `SHChangeNotify`

### 18.2 Recommended helper functions

```rust
fn ensure_parent_key(root: &str, group_id: &str) -> Result<RegistryKey>;
fn write_parent_values(key: &RegistryKey, plan: &MenuGroupPlan, target: ShellTarget) -> Result<()>;
fn clear_owned_children(parent_shell_key: &RegistryKey) -> Result<()>;
fn write_child_item(parent_shell_key: &RegistryKey, item: &MenuItemPlan, group_id: &str) -> Result<()>;
fn delete_v2_group(group_id: &str) -> Result<()>;
fn detect_legacy_v1_groups() -> Result<Vec<LegacyGroup>>;
fn migrate_v1_to_v2() -> Result<MigrationReport>;
fn notify_shell_assoc_changed();
```

### 18.3 Error model

Use structured errors with these categories:

- `RegistryOpenFailed`
- `RegistryWriteFailed`
- `RegistryDeleteFailed`
- `ShellNotifyFailed`
- `LegacyDetectionFailed`
- `MigrationFailed`
- `VerificationFailed`

---

## 19. Verification checklist

A v2 apply is valid only if all checks pass.

### 19.1 Registry structure checks

- parent key exists under every enabled root
- parent contains `Execlink.Owner`
- parent contains `Execlink.SchemaVersion=2`
- `shell` subkey exists
- every enabled item has child key + command subkey
- every command subkey has `(Default)`

### 19.2 Behavior checks

- right-click on folder background shows ExecLink group
- right-click on folder shows ExecLink group
- right-click on desktop background shows ExecLink group
- right-click on drive shows ExecLink group
- clicking each item opens the intended CLI in the intended directory

### 19.3 Cleanup checks

- changing title does not create duplicate parent keys
- changing order rewrites child keys deterministically
- disabling an item removes only that item’s key
- uninstall removes only ExecLink-owned keys

---

## 20. Explicit non-goals

The following are out of scope for schema v2:

1. Windows 11 modern top-level compact context menu integration
2. COM shell extensions
3. `IExplorerCommand` implementation
4. package identity / sparse package work
5. `HKLM` machine-wide installation
6. Nilesoft `.nss` interoperability as a first-class runtime mode

---

## 21. Recommended defaults for ExecLink v2

Use these defaults unless the product requirements change.

### 21.1 Parent defaults

- `group_id = main`
- parent key name = `ExecLink.main`
- parent title = `Open with ExecLink`
- parent icon = `ExecLink.exe,0`

### 21.2 Child order defaults

- `010_claude`
- `020_codex`
- `030_gemini`
- `040_kimi`
- `050_kimi_web`
- `060_qwencode`
- `070_opencode`

### 21.3 Refresh defaults

- first: `SHChangeNotify`
- second: hard Explorer restart fallback

---

## 22. Final recommendation

For ExecLink, the most robust path is:

- keep the existing frontend configuration model
- replace the current PowerShell-generated HKCU menu writer with a Rust registry writer
- adopt this v2 schema with **stable key IDs + ownership markers + explicit migration logic**
- treat v1 as a migration source, not as a long-term compatibility format

That gives you a lightweight native implementation without bringing in the complexity of Nilesoft or COM shell extensions.
