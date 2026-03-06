# 2026-03-05 任务栏右键与折叠菜单回归修复（taskbar.nss 占位误伤）

## 计划清单
- [x] 定位“AI CLIs 出现但任务栏右键与折叠菜单消失”的根因。
- [x] 修复 `taskbar.nss` 占位策略：缺失时写入可用 fallback，若检测到旧占位内容则自动升级。
- [x] 在最小 `shell.nss` 中补回 `Pin/Unpin` 与 `more_options` 折叠菜单块。
- [x] 新增回归测试覆盖 taskbar 占位升级与保留已有 taskbar 配置行为。
- [x] 运行测试并对本机运行时文件执行即时修复。

## 执行记录
- 从 `C:\\Users\\Qian\\AppData\\Local\\execlink\\nilesoft-shell\\imports\\taskbar.nss` 确认该文件被写成占位注释，导致导入存在但无任务栏菜单定义。
- `nilesoft.rs` 调整：
- `REQUIRED_IMPORT_PLACEHOLDERS` 移除 `taskbar.nss` 占位生成。
- 新增 `ensure_taskbar_import_file`：`taskbar.nss` 缺失/为空/命中占位标记时写入可用 fallback 内容。
- `taskbar.nss` fallback 升级为双 `menu(type=\"taskbar\")` 结构（参考社区 issue #495 实践），避免“有导入无菜单定义”。
- 新增日志可观测标签：
- `taskbar_recovered_from_missing`
- `taskbar_upgraded_from_placeholder`
- `taskbar_preserved_custom`
- `SHELL_NSS_MINIMAL` 补回：
- `menu(mode=\"multiple\" title=\"Pin/Unpin\" image=icon.pin)`
- `menu(mode=\"multiple\" title=title.more_options image=icon.more_options)`
- 新增测试：
- `should_upgrade_placeholder_taskbar_import_to_fallback`
- `should_keep_existing_taskbar_import_if_not_placeholder`
- `should_not_mix_back_and_back_dir_in_top_level_menu_type`
- 验证结果：
- `cargo test --manifest-path src-tauri/Cargo.toml should_upgrade_placeholder_taskbar_import_to_fallback -- --test-threads=1` 通过
- `cargo test --manifest-path src-tauri/Cargo.toml nilesoft::tests -- --test-threads=1`（18/18 通过）
- `cargo test --manifest-path src-tauri/Cargo.toml`（54/54 通过）
- `npm run build`（通过）
- 已对本机运行时文件执行热修：
- `imports/taskbar.nss` 占位内容替换为可用 taskbar fallback
- `shell.nss` 补回 `Pin/Unpin` 与 `more_options` 菜单块
- 根据用户反馈“任务栏出现但非 Windows 原生菜单”，将 taskbar fallback 可见性调整为 `vis=key.shift()`：
- 默认右键：走 Windows 原生任务栏菜单
- `Shift + 右键`：显示 Nilesoft 自定义任务栏菜单
- 新增回归测试：
- `should_limit_taskbar_fallback_visibility_to_shift`
- 验证结果补充：
- `cargo test --manifest-path src-tauri/Cargo.toml nilesoft::tests::should_limit_taskbar_fallback_visibility_to_shift -- --test-threads=1` 通过
- `cargo test --manifest-path src-tauri/Cargo.toml nilesoft::tests -- --test-threads=1`（19/19 通过）

## 回顾
- 对功能性 import（如 `taskbar.nss`）不能使用“空占位”兜底，否则会出现“文件存在但功能缺失”的隐性回归。
- 最小化配置时应保留关键兼容菜单块（如 `more_options`），避免影响系统交互预期。

# 2026-03-05 应用后 AI CLIs 分组不显示修复（Nilesoft type 组合冲突）

## 计划清单
- [x] 从 `shell.log` 定位“应用后菜单不显示”根因并提取关键报错。
- [x] 修复 `ai-clis.nss` 顶层 menu 的 `type` 组合为 Nilesoft 合法写法。
- [x] 增加回归测试，防止再次出现 `back` 与 `back.dir` 混用。
- [x] 运行针对性测试验证修复结果。
- [x] 回填执行记录与回顾。

## 执行记录
- 通过 `C:\\Users\\Qian\\AppData\\Local\\execlink\\nilesoft-shell\\shell.log` 确认最新报错：
- `line[1] column[35], Property type and sub type cannot combine "ai-clis.nss"`。
- 报错对应当前渲染内容：`menu(type='dir|drive|back|back.dir' ...)`，属于 `type` 与 `sub type` 组合冲突。
- 已将顶层菜单类型修正为 `menu(type='dir|drive|back' ...)`，移除冲突的 `back.dir`。
- 新增回归单测 `should_not_mix_back_and_back_dir_in_top_level_menu_type`，断言不再输出冲突组合。

## 回顾
- 该问题不是“保留右键折叠菜单”导致，而是 `ai-clis.nss` 语法冲突导致 Nilesoft 直接拒绝导入文件。
- 对 Nilesoft `type` 变更应配套日志回归检查，避免“文件写入成功但运行时解析失败”的隐性故障。

# 2026-03-05 版本 +0.0.1 与构建安装包（本次）

## 计划清单
- [x] 执行 `npm run bump:patch`，将版本提升 `+0.0.1` 并同步清单文件。
- [x] 执行版本一致性校验 `npm run sync-version:check`。
- [x] 执行安装包构建 `npm run tauri -- build`。
- [x] 校验 MSI/NSIS 产物路径与时间戳。
- [x] 回填执行记录与回顾。

## 执行记录
- 执行 `npm run bump:patch`，版本由 `0.2.8` 升级至 `0.2.9`。
- `sync-version` 自动同步版本到：
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/wix/main.wxs`
- 执行 `npm run sync-version:check`，校验通过（版本一致：`0.2.9`）。
- 执行 `npm run tauri -- build`，构建成功，生成安装包：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.9_x64_zh-CN.msi`（4521984 bytes，2026-03-05 22:17:55）
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.9_x64-setup.exe`（3333649 bytes，2026-03-05 22:18:02）
- 构建期间出现 1 条 Rust 编译警告：`filter_config_toggles_by_detection` 当前未被调用（不影响本次打包成功）。

## 回顾
- 采用 `bump:patch + sync-version + sync-version:check` 可以保持多版本清单一致，避免打包阶段才暴露版本漂移。
- 当前 `0.2.9` 安装包（MSI/NSIS）已可用于后续发布流程。

# 2026-03-05 应用配置后 AI CLIs 右键菜单不显示修复

## 计划清单
- [x] 后端 `apply_config` 改为按用户配置直接写入，不再在该路径执行检测过滤。
- [x] 前端仅在自动同步菜单路径执行“按检测结果过滤”。
- [x] `write_shell_nss` 写入前确保 `imports/theme.nss`、`imports/images.nss`、`imports/taskbar.nss` 缺失时自动补齐占位文件。
- [x] 增加/调整测试覆盖上述行为，并运行 `cargo test` 与 `npm run build` 验证。
- [x] 回填执行记录、回顾与 lessons 经验条目。

## 执行记录
- 后端 `apply_config` 移除 `detect_all_clis + filter_config_toggles_by_detection` 渲染过滤，改为按用户配置直接写入 `.nss`。
- 保留后端 `filter_config_toggles_by_detection` 函数用于自动流程语义，不删除既有单测覆盖。
- 前端新增 `filterConfigTogglesByDetection`，仅在 `syncMenuAfterCliChange -> applyMenuConfigWithFallback` 自动同步路径生效。
- 手动“应用配置”、提权后同步、一键维护路径保持按用户配置写入（不引入检测过滤）。
- `nilesoft::write_shell_nss` 写入前新增 `ensure_required_import_placeholders`：缺失时创建 `imports/theme.nss`、`imports/images.nss`、`imports/taskbar.nss` 占位文件（不覆盖已有文件）。
- 新增单测：
- `nilesoft::tests::should_create_required_import_placeholders_when_missing`
- `nilesoft::tests::should_not_overwrite_existing_required_import_placeholders`
- 验证结果：
- `cargo test --manifest-path src-tauri/Cargo.toml`（51/51 passed）
- `npm run build`（passed）

## 回顾
- 手动“应用配置”属于用户意图执行，不应被运行时检测结果隐式改写；自动同步可按检测结果做收敛。
- `shell.nss` 的 import 链路依赖应做“缺失补齐、已有不覆盖”兜底，避免单文件缺失导致整菜单失效。

# 2026-03-05 注册误报修复（maintenance_register_incomplete 误判）

## 计划清单
- [x] 修复注册成功但即时复检失败导致的误报
- [x] 提升注册失败详情可读性（补充 exit code / stdout / stderr）
- [x] 一键维护注册阶段加入“失败后复检成功继续流程”兜底
- [x] 前端提权重试避免把已成功复检状态强制改回未注册
- [x] 运行验证：`cargo test`、`npm run build`

## 执行记录
- `nilesoft_install::ensure_registration_points_to` 改为带超时轮询复检（8s/250ms），避免注册写入存在短暂延迟时误判失败。
- `register_normal/register_elevated` 失败信息补齐 `exit code` 与 `stdout/stderr` 摘要，解决“提权注册失败: ”空白详情问题。
- `one_click_install_repair` 注册阶段改为“命令失败后仍执行状态复检”，若复检已注册则继续 `apply/activate`，不再直接 `maintenance_register_incomplete` 中断。
- `request_elevation_and_register` 增加“命令报错但复检成功则返回成功”的后端兜底码 `register_elevated_recheck_ok`。
- 前端 `onRetryElevation` 修复：失败后复检若已注册，不再强制设为 `registered=false`，并回传成功提示。
- 验证通过：
- `cargo test --manifest-path src-tauri/Cargo.toml`（49/49）
- `npm run build`

## 回顾
- 对涉及 UAC/注册表的系统操作，不应仅依赖进程即时返回码；必须叠加状态复检，避免“实际成功但前端提示失败”。
- 前后端都应避免把“未知/异常”直接降级为“确定失败”，应优先做一次一致性复核。

# 2026-03-05 右键菜单兼容修复（保留任务栏右键 + 桌面/盘符可用）

## 计划清单
- [x] 定位任务栏右键丢失与桌面/盘符不可用的配置根因
- [x] 调整 Nilesoft 最小 `shell.nss`：补齐 taskbar 相关导入
- [x] 扩展 AI 菜单作用类型，覆盖 `drive/back` 场景
- [x] 扩展 HKCU 兜底菜单作用域到 `DesktopBackground/Drive`
- [x] 补齐已安装目录缺失的 Nilesoft 资源文件（imports）回填
- [x] 运行验证：`cargo check`、`cargo test`

## 执行记录
- `SHELL_NSS_MINIMAL` 新增 `theme.nss`、`images.nss`、`taskbar.nss` 导入，避免仅导入 `ai-clis.nss` 导致任务栏菜单链路不完整。
- `render_ai_clis_nss` 的菜单类型从 `dir|back.dir` 扩展为 `dir|drive|back|back.dir`，覆盖盘符根目录与背景场景。
- HKCU 脚本 `build_hkcu_menu_script/build_remove_hkcu_menu_script/build_list_hkcu_menu_groups_script` 增加：
- `HKCU\\Software\\Classes\\DesktopBackground\\shell`
- `HKCU\\Software\\Classes\\Drive\\shell`
- `ensure_installed` 增加资源回填步骤：即使已存在 `shell.exe`，也会从 `nilesoft.zip` 补齐缺失文件（仅补缺，不覆盖已有文件）。
- 验证通过：
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`（49/49）

## 回顾
- 仅校验 `shell.exe` 存在不足以判定安装完整，Shell 扩展场景需要同时关注 `imports` 资源完整性。
- 在 Windows 11 下，传统右键注册项与 shell 扩展都属于经典菜单链路，需明确“一级菜单”能力边界，避免用户误解。

# 2026-03-03 更新安装文档（README + install_kimi）

## 计划清单
- [x] 更新 README：补全依赖说明、推荐顺序、CLI 安装命令与 Kimi/Python 说明
- [x] 新增 `install_kimi.md`：沉淀 winget、Git for Windows、Kimi 官方/镜像完整流程与命令
- [x] 校对文档命令与当前实现一致（`commands.rs` / `Home.tsx`）
- [x] 回填执行记录与回顾

## 执行记录
- 已创建任务清单，准备执行文档更新。
- 已更新 `README.md`：
- 新增“安装依赖（Windows）”“推荐安装顺序”“依赖安装命令”“CLI 安装命令总览”。
- 明确 `winget` 前置检测、Microsoft Store 推荐链接、Kimi 通过 `uv` 安装并涉及 Python 3.13、以及“仅保留 Python 可卸载 kimi-cli”。
- 已新增 `install_kimi.md`：
- 沉淀 `winget` 检测与安装、Git for Windows 官方源/清华源完整流程命令。
- 沉淀 Kimi 官方源与镜像源完整流程（含 uv 引导、Python 3.13、镜像探测与失败策略）。
- 已按当前实现校对关键命令常量：`winget`、`Git`、`Node.js`、`Kimi` 及各 CLI 安装命令。

## 回顾
- 安装文档应优先以代码中的命令常量为唯一真源，README 放摘要与主命令，复杂流程沉淀到独立文档可降低维护成本。

# 2026-03-03 推送代码并更新 Release 说明（winget 检测 + 微软商店推荐）

## 计划清单
- [x] 梳理当前改动并确认待推送分支与远端状态
- [x] 提交本地改动并执行 `git push`
- [x] 更新 GitHub Release 说明：增加 winget 检测提示与微软商店下载推荐
- [x] 复核远端提交与 Release 说明已生效

## 执行记录
- 已创建本次推送与发布说明更新任务清单，准备执行。
- 本地改动已提交：`a1fd62c feat: improve maintenance flow and winget prerequisite handling`。
- 代码已推送：`main -> origin/main`。
- 已创建并发布 Release：`v0.2.7`（https://github.com/endearqb/execlink/releases/tag/v0.2.7）。
- Release 说明已增加：安装前置 `winget` 检测、缺失/失败时推荐通过 Microsoft Store 安装 App Installer（winget）。

## 回顾
- 推送流程中网络连通存在间歇性波动，关键发布动作（tag/release）需要在失败后快速重试并验证结果。

# 2026-03-03 shell.dll 占用导致恢复失败修复（os error 32）

## 计划清单
- [x] 定位 `os error 32` 根因并确认触发链路
- [x] 将安装恢复逻辑改为“合并复制且不覆盖已存在文件”
- [x] 增加回归测试覆盖“保留已存在文件”场景
- [x] 运行验证：`cargo test nilesoft_install::tests`、`cargo check`、`npm run build`

## 执行记录
- 定位到 `recover_install_root_from_source` 在恢复前执行 `remove_dir_all(target_root)`，当 `shell.dll` 被资源管理器占用时触发 `os error 32`。
- 新增 `merge_copy_dir_recursive_skip_existing`，恢复过程改为“只补齐缺失文件，不删除/不覆盖已存在文件”。
- 保留恢复后 `shell.exe` 存在性校验，确保恢复链路可用。
- 新增单测 `should_not_overwrite_existing_files_when_recovering`，验证目标目录既有文件不会被覆盖。
- 已完成验证：
- `cargo test --manifest-path src-tauri/Cargo.toml nilesoft_install::tests`（6 通过）
- `cargo check --manifest-path src-tauri/Cargo.toml`（通过）
- `npm run build`（通过）

## 回顾
- 在 Windows 上处理 shell 扩展相关文件时，恢复逻辑应避免先删目录再复制，优先采用非破坏式补齐策略以规避锁文件失败。

# 2026-03-03 一键维护失败修复（失败自动弹详情 + 安装自动恢复）

## 计划清单
- [x] 前端：一键维护失败时自动弹出详情弹窗，不再依赖 toast 展开
- [x] 后端：`one_click_install_repair` 细分安装阶段错误码并增强阶段日志
- [x] 后端：`ensure_installed` 增加“从系统已注册目录恢复安装目录”兜底
- [x] 验证：`cargo test`、`cargo check`、`npm run build`

## 执行记录
- 已创建任务计划，准备实施前后端修复。
- 前端 `Home.tsx` 新增维护失败详情弹窗状态，维护类失败码自动弹出可滚动详情，不再依赖 toast 内联 `details` 交互。
- 前端 toast 行为调整：错误提示时长延长至 10 秒；维护类失败显示“详情弹窗已自动打开”摘要提示。
- 后端 `one_click_install_repair` 新增阶段日志（install/register/recheck/apply/fallback/refresh）并将安装阶段错误码细分为 `maintenance_install_failed`。
- 后端 `nilesoft_install::ensure_installed` 增加自动恢复：常规安装失败后，尝试从系统已注册目录复制恢复到当前安装目录后继续执行。
- 后端新增恢复逻辑单元测试：成功恢复与“源目标相同”失败场景。
- 已完成验证：
- `cargo test --manifest-path src-tauri/Cargo.toml`（45 通过）
- `cargo check --manifest-path src-tauri/Cargo.toml`（通过）
- `npm run build`（通过）

## 回顾
- 对“失败即中断”流程，必须保证失败详情在主 UI 可稳定读取，不能依赖短时 toast 的可点击交互。
- 一键维护应提供“安装失败后的自动恢复”路径，优先复用系统已注册目录，减少无 UAC 的立即失败。

# 2026-03-03 版本号补丁升级并构建应用（0.2.6 -> 0.2.7）

## 计划清单
- [x] 将版本号从 `0.2.6` 升级到 `0.2.7`（`+0.0.1`）
- [x] 同步版本到 Tauri/Rust/WiX 相关配置
- [x] 执行应用构建并确认产物生成

## 执行记录
- 已创建任务计划，准备执行版本升级与构建。
- 执行 `npm run bump:patch`，版本从 `0.2.6` 升级到 `0.2.7`。
- 版本同步脚本自动更新：`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/wix/main.wxs`。
- 执行 `npm run tauri -- build`：首次在沙箱内因 `spawn EPERM` 失败，随后在无沙箱环境重试成功。
- 构建产物生成成功：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.7_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.7_x64-setup.exe`

## 回顾
- 补丁升级沿用 `bump:patch + sync-version` 流程可避免多处手工漏改。
- 打包构建遇到 `spawn EPERM` 时，应改为无沙箱执行以通过子进程权限限制。

# 2026-02-28 Git 源选择与前置安装 UI 优化

## 计划清单
- [x] 新增 Git 安装源三按钮弹窗（官方源 / 清华源 / 取消）
- [x] 顶部按钮收敛为“安装前置环境”动态入口，消除 4 按钮拥挤
- [x] 前端 API 与类型新增 `launchPrereqInstall` / `GitInstallSource`
- [x] 后端新增 `launch_prereq_install`（支持 Git 官方源与清华源）
- [x] 主进程注册新命令并保留旧命令兼容
- [x] 增加后端单元测试覆盖源选择与命令拼接
- [x] 运行验证：`npm run build`、`cargo check`、`cargo test`

## 执行记录
- 初始化任务清单，准备实施。
- 完成前端：新增 `GitInstallSourceDialog`，接入源选择 Promise 流程。
- 完成前端：顶部安装按钮改为动态“安装前置环境/安装 Git/安装 Node.js”单入口。
- 完成后端：新增 `launch_prereq_install`，支持 Git 官方源与清华源策略，单终端顺序执行安装。
- 完成后端：新增测试覆盖源解析与脚本拼接。
- 完成验证：构建与测试全通过。

## 回顾
- 交互层面将 Git 源选择从二元确认升级为三按钮弹窗，避免误触即安装。
- 安装入口收敛后，顶部操作区稳定在 3 个按钮以内，信息密度更可控。
- 兼容性上保留旧命令 `launch_git_install` / `launch_nodejs_install`，降低回归风险。

# 2026-02-28 Git 清华源安装 404 修复

## 计划清单
- [x] 定位 404 根因：GitHub Release 链接仅替换域名，镜像路径不兼容
- [x] 后端改为纯清华源 `LatestRelease` 解析并下载 `Git-*-64-bit.exe`
- [x] 前端清华源命令预览同步为 `LatestRelease` 方案
- [x] 更新后端测试断言，覆盖“含 `LatestRelease` / 不含 GitHub API 与 `releases/download`”
- [x] 运行验证：`cargo test`、`cargo check`、`npm run build`

## 执行记录
- 读取 `src-tauri/src/commands.rs` 与 `src/components/GitInstallSourceDialog.tsx`，确认旧逻辑依赖 GitHub API + 域名替换。
- 将后端脚本切换为解析清华 `LatestRelease` 目录中的 `Git-*-64-bit.exe`，并保留管理员安装流程。
- 同步更新前端“清华源”命令预览，避免继续展示会触发 404 的旧方案。
- 调整单元测试断言，确保命令字符串不再包含 GitHub API 与 `releases/download`。
- 完成验证：`cargo test`（34/34 通过）、`cargo check` 通过、`npm run build` 通过。

## 回顾
- 通过移除 GitHub API 依赖，清华源安装在受限网络下更稳健。
- 命令预览与真实执行逻辑保持一致，降低排障成本。

# 2026-02-28 Git 清华源脚本解析错误修复（UnexpectedToken）

## 计划清单
- [x] 定位语法错误根因：`$latestReleaseUrl$installerName` 变量紧邻拼接在执行链路中解析异常
- [x] 后端改为显式 `+` 拼接：`$tunaUrl = $latestReleaseUrl + $installerName`
- [x] 增加回归断言：必须包含 `+` 拼接，且不允许出现紧邻拼接写法
- [x] 前端预览同步变量命名为 `installerName`，与后端脚本保持一致
- [x] 运行验证：`cargo test`、`cargo check`、`npm run build`

## 执行记录
- 检查 `src-tauri/src/commands.rs` 中清华源命令拼接，确认存在紧邻变量拼接语句。
- 将拼接语句改为显式 `+` 连接，避免 PowerShell 解析歧义。
- 在后端测试中新增针对拼接形式的正反断言，避免同类问题回归。
- 同步更新 `GitInstallSourceDialog` 预览中的变量命名与拼接展示。
- 完成验证：`cargo test`（34/34 通过）、`cargo check` 通过、`npm run build` 通过。

## 回顾
- PowerShell 字符串/变量拼接在多层 `-Command` 传递场景下更应使用显式操作符，避免被转义链路破坏。
- 关键命令字符串应由测试固定住具体语法形态，减少运行时才暴露的解析错误。

# 2026-02-28 清华源解析增强与版本号单一来源改造

## 计划清单
- [x] 清华源 Git 解析改为基于 `Invoke-WebRequest(...).Links` 提取安装包链接
- [x] 增加 `LatestRelease -> 版本目录` 二跳回退，并统一使用 `System.Uri` 拼接绝对下载地址
- [x] 前端清华源命令预览同步为 `Links + Uri` 解析思路
- [x] 引入 `scripts/sync-version.mjs`，以 `package.json` 作为版本号唯一来源同步到 Tauri/Rust/WiX
- [x] 新增版本管理脚本：`sync-version`、`sync-version:check`、`bump:patch|minor|major`
- [x] 前端版本展示改为构建注入常量 `__APP_VERSION__`，移除硬编码版本号
- [x] 运行验证：`npm run sync-version`、`npm run sync-version:check`、`cargo test`、`cargo check`、`npm run build`、`npm run tauri -- build`

## 执行记录
- 将后端清华源安装脚本从“HTML 正则硬抓文件名”升级为“优先解析 Links，再回退版本目录 Links”。
- 下载 URL 组装统一改为 `System.Uri`，避免相对/绝对链接拼接歧义。
- 清华源命令预览与后端逻辑对齐，避免页面提示与真实执行脱节。
- 新增版本同步脚本并接入 npm scripts，形成“一处改版本 + 一条 bump 命令”的流程。
- Vite 配置新增 `__APP_VERSION__` 注入，首页版本号不再手工维护。
- 完成验证：`npm run sync-version`、`npm run sync-version:check`、`cargo test`（34/34 通过）、`cargo check`、`npm run build`、`npm run tauri -- build` 全通过。

## 回顾
- 镜像站目录页面解析应优先基于链接对象而非纯文本正则，抗页面细节变化能力更强。
- 版本号单一来源显著降低漏改风险，也让发布流程更可重复。

# 2026-02-28 uv 安装失败修复（Kimi 前置）

## 计划清单
- [x] 定位 uv 引导失败风险点：仅依赖官方 install.ps1，网络/策略异常时容易失败
- [x] 引入更稳健的 uv 引导策略：优先 winget，失败后回退官方脚本
- [x] 统一 Kimi 两处 uv 逻辑（前置安装与镜像安装前检查）复用同一脚本生成函数
- [x] 增强 PATH 回灌：补充 `.local\\bin` 与 `.cargo\\bin`，并避免重复拼接
- [x] 运行验证：`npm run build`

## 执行记录
- 在 `src/pages/Home.tsx` 新增 `buildEnsureUvCommandLines` 统一生成 uv 检测/安装脚本。
- 将 `buildKimiToolInstallCommand` 和 `buildKimiUvBootstrapCommand` 改为复用统一逻辑，避免分叉实现。
- uv 安装流程改为“检测 -> winget 安装尝试 -> 官方脚本回退 -> PATH 注入 -> 复检”，失败提示增加手动兜底命令。
- 完成验证：`npm run build` 通过。

## 回顾
- 对外部安装器的依赖应提供多路径回退，单一路径在国内网络环境下稳定性不足。
- 复用同一脚本生成函数可避免两处流程行为漂移导致的隐性故障。

# 2026-02-28 uv 安装脚本编码兼容修复（嵌入终端续行）

## 计划清单
- [x] 分析终端日志中 `>>` 续行现象，定位为脚本输出文本编码导致的引号闭合异常风险
- [x] 将 uv 引导脚本中的中文 `Write-Host` 与 `throw` 文本改为 ASCII 文本
- [x] 运行验证：`npm run build`

## 执行记录
- 根据用户日志中 `Write-Host` 行乱码且续行的现象，判断嵌入终端对非 ASCII 文本存在转码风险。
- 将 uv 安装脚本内联文本统一改为 ASCII，避免脚本在传输链路中被破坏。
- 完成验证：`npm run build` 通过。

## 回顾
- 内置终端执行脚本应尽量避免非 ASCII 字面量，尤其在单引号字符串内，降低编码差异触发的语法失败概率。

# 2026-03-02 CLI 安装前置自动补装 winget

## 计划清单
- [x] 后端新增 `launch_winget_install` 与 `open_winget_install_page` 命令
- [x] 前端 API 新增 `launchWingetInstall` 与 `openWingetInstallPage`
- [x] 前端新增统一前置检查器，接入“安装前置环境 / 仅执行安装 / 快速安装向导”
- [x] 后端补充 `winget` 引导命令构建单元测试
- [x] 运行验证：`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run build`

## 执行记录
- 后端新增 `build_winget_bootstrap_command`，默认使用 `https://aka.ms/getwinget` 下载并通过 `Add-AppxPackage` 安装，安装后强制复检 `winget`。
- 后端新增命令 `launch_winget_install`（管理员终端启动）与 `open_winget_install_page`（Microsoft Store 兜底页面）。
- 前端 API 新增 `launchWingetInstall` / `openWingetInstallPage` 并接入 `Home.tsx`。
- `Home.tsx` 新增统一前置检查器 `ensureWingetBeforeCliInstall`，并接入“安装前置环境 / 仅执行安装 / 快速安装向导”三条链路。
- 缺失 `winget` 时统一流程为：确认 -> 自动安装 -> 轮询复检；失败或超时时提示打开官方安装页。
- 已完成验证：`cargo test --manifest-path src-tauri/Cargo.toml`（41 通过）、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run build`。
- 针对 `Invoke-WebRequest` 超时反馈，`winget` 下载改为“官方 `aka.ms/getwinget` 失败后自动回退清华 `github-release/microsoft/winget-cli/LatestRelease/` 解析下载”。
- 新增回归断言：必须包含清华回退解析（`$tunaPage.Links`）与官方下载失败提示分支。
- 已完成增量验证：`cargo test --manifest-path src-tauri/Cargo.toml commands::tests::should_build_winget_bootstrap_command`、`cargo check --manifest-path src-tauri/Cargo.toml`。
- 根据最新交互需求，改为“缺少 winget 时直接弹窗选择安装源（官方 / 清华 / 取消）”，不再默认官方优先。
- 后端 `launch_winget_install` 增加 `source` 参数并按来源构建脚本；前端新增 `WingetInstallSourceDialog` 与 `requestWingetInstallSource` 统一接入三条安装链路。
- 已完成最终验证：`cargo test --manifest-path src-tauri/Cargo.toml`（43 通过）、`npm run build`。

## 回顾
- 将 `winget` 处理从分散报错收敛为统一前置流程后，安装体验更一致，也减少“点安装才知道缺依赖”的中断。
- “自动安装 + 手动兜底页面”兼顾了可自动化与异常场景下的可恢复性。
- 对联网安装入口应提供镜像/回退通道，避免单一官方短链在部分网络环境下成为阻断点。
- 将“安装源决策”前置到用户选择，可以减少误判网络环境导致的首轮失败与重复重试。

# 2026-02-28 uv 命令改为逐条输入执行

## 计划清单
- [x] 将 uv 引导脚本拆为单行命令数组，避免大段多行脚本在内置终端中一次性注入
- [x] 新增逐条执行辅助函数，按步骤输出并依次写入内置终端
- [x] 快速安装向导 uv 步骤接入逐条执行逻辑
- [x] 运行验证：`npm run build`

## 执行记录
- `buildEnsureUvCommandLines` 改为单行命令集合，保留 winget 优先 + 官方脚本回退 + PATH 回灌 + 复检。
- 在 `Home` 组件中新增 `runTerminalCommandsSequentially`，每条命令单独写入终端并输出步骤序号。
- uv 安装阶段由一次 `terminalRunScript(大脚本)` 改为循环逐条执行。
- 完成验证：`npm run build` 通过。

## 回顾
- 逐条注入命令比整段脚本更抗编码/引号破坏，也更容易定位具体失败步骤。

# 2026-02-28 Kimi 镜像失败立即退出（快速向导）

## 计划清单
- [x] 确认清华源可用性状态，并定位 `python-build-standalone` 404 根因
- [x] 为 Kimi 快速向导新增阿里镜像备选（Python 镜像 + PyPI 索引）
- [x] 快速向导镜像安装改为“清华优先、失败切阿里、全部失败立即退出”
- [x] 内置终端命令执行增加“等待结果标记”机制，避免仅写入成功就进入复检等待
- [x] 运行验证：`npm run build`

## 执行记录
- 通过 `curl -I/-L` 核验镜像可用性：清华/阿里 `github-release/astral-sh/python-build-standalone` 当前均返回 404，清华与阿里 PyPI simple 可访问。
- 在 `Home.tsx` 中新增快速向导专用镜像脚本生成函数：Python 安装阶段按清华 -> 阿里顺序尝试，kimi-cli 安装阶段按清华索引 -> 阿里索引顺序尝试，全部失败直接 `throw`。
- 新增 `runTerminalScriptAndWait`，在内置终端执行时写入唯一结果标记并轮询终端缓冲区，拿到真实执行结果后再决定继续/失败。
- 将快速向导中的 uv 逐条命令、Python 安装、Kimi 安装接入结果等待机制；一旦失败，立即设置失败状态并退出流程。
- 更新快速向导“选择安装源”说明文案，明确阿里镜像备选与“失败即退出”行为。
- 完成验证：`npm run build` 通过。

## 回顾
- “命令已写入终端”与“命令执行成功”必须分离处理，否则会造成失败后长时间无效等待。
- 镜像策略应该在脚本层完成顺序回退并显式失败，避免把真实失败延后到复检阶段才暴露。

# 2026-02-28 Kimi 镜像秒级失败与分步执行（快速向导）

## 计划清单
- [x] 镜像可用性改为秒级预探测（HEAD + 3s 超时），不可用立即跳过
- [x] Python/Kimi 镜像安装改为分步命令执行，不再使用循环拼接大脚本
- [x] 两个镜像都不可用时立即失败退出，不进入长时间复检等待
- [x] 运行验证：`npm run build`

## 执行记录
- 在 `Home.tsx` 新增镜像探测命令生成函数，统一使用 `Invoke-WebRequest -Method Head -TimeoutSec 3` 做快速可用性检查。
- Python 安装流程改为：逐镜像执行“探测 -> 设置 `UV_PYTHON_INSTALL_MIRROR` -> `uv python install`”三步链路。
- Kimi 安装流程改为：逐索引执行“探测 -> `uv tool install ... -i <index>`”分步链路。
- 取消镜像安装的多行循环拼接脚本，安装改为显式逐步执行并记录每步失败详情。
- 完成验证：`npm run build` 通过。

## 回顾
- 对镜像源异常应先做低成本可用性探测，再执行安装命令，可显著缩短故障反馈时间。
- 快速安装向导中的命令分步执行更易观察、更便于定位失败点，也避免“大脚本黑盒等待”。

# 2026-02-28 Kimi 镜像切换为 CPython 安装器（清华/阿里）

## 计划清单
- [x] 将 Kimi 镜像 Python 安装从 `uv python install` 改为 CPython 安装器下载+静默安装（清华优先，阿里回退）
- [x] 保留秒级镜像探测与分步执行，两个镜像都不可用时立即失败退出
- [x] 镜像模式 Python 复检改为快速运行时检查，避免长时间轮询等待
- [x] 更新快速向导提示与安装计划预览文案，确保与新链路一致
- [x] 运行验证：`npm run build`

## 执行记录
- 在 `Home.tsx` 中将 Python 镜像常量切换为清华/阿里 CPython 安装器地址（`python-3.13.12-amd64.exe`）。
- 新增 Python 运行时快速检查命令，优先检测 `%LocalAppData%\\Programs\\Python\\Python313\\python.exe`，回退 `py -3.13`。
- 重写镜像 Python 安装步骤为分步命令：下载 -> 静默安装 -> 运行时校验 -> 清理安装器。
- 保留镜像探测 `HEAD + 3s` 策略；镜像不可用时立即跳过，全部失败立即退出。
- Kimi CLI 镜像安装步骤改为优先使用本地 `Python313` 路径，再回退版本号 `3.13`。
- 快速向导 Python 复检在镜像模式下改为单次快速运行时检查，不再进入长时间轮询等待。
- 更新快速向导文案与计划预览，展示新的 Python 安装器镜像地址与步骤。
- 完成验证：`npm run build` 通过。

## 回顾
- `python-build-standalone` 镜像不可用时，直接切换到 CPython 安装器镜像能更稳定落地。
- 镜像模式应优先采用“探测 + 分步 + 快速失败”的执行策略，减少无效等待并提升可诊断性。

# 2026-02-28 版本号补丁升级并构建应用

## 计划清单
- [x] 将版本号从当前值提升 `+0.0.1`（patch）
- [x] 同步版本到 Tauri/Rust/WiX 配置
- [x] 执行应用构建并确认构建成功

## 执行记录
- 执行 `npm run bump:patch`，版本从 `0.2.5` 升级到 `0.2.6`。
- 版本同步脚本已更新并校验以下文件：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/wix/main.wxs`。
- 执行 `npm run tauri -- build`：首次在沙箱内因 `spawn EPERM` 失败，随后在无沙箱环境重试成功。
- 构建产物生成成功：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.6_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.6_x64-setup.exe`

## 回顾
- 补丁升级统一走 `bump:patch + sync-version` 可以避免多处版本号手改漏改。
- Tauri 构建若遇 `spawn EPERM`，通常需要切换到无沙箱环境执行打包。

# 2026-02-28 镜像探测超时修复与快速向导终端隐藏

## 计划清单
- [x] 镜像探测从 `Invoke-WebRequest` 改为 `curl`，并设置连接/总超时，减少结果标记超时误判
- [x] 调整探测等待窗口与超时详情，超时时在详情中附带终端输出尾部
- [x] 快速安装向导运行时默认隐藏内置终端，仅在向导“详情”中查看日志
- [x] 运行验证：`npm run build`

## 执行记录
- 在 `Home.tsx` 将镜像探测命令改为 `curl.exe -I -L --connect-timeout 3 --max-time 8`，并保留 HTTP 状态码与退出码判定。
- 探测步骤的外层结果等待由 `12s` 调整为 `20s`，避免探测命令接近超时时出现“结果标记未返回”的误判。
- 在 `runTerminalScriptAndWait` 超时分支加入终端输出尾部汇总（最近 40 行），可直接在失败详情排查。
- 将 `runTerminalScriptAndWait` 的多行包装脚本改为“Base64 编码 + 单行 `ScriptBlock::Create` 执行”，避免交互式 PowerShell 停在 `>>` 续行导致无结果标记。
- 在 `CliConfigTable` 新增 `suppressTerminal` 控制；快速向导开启时隐藏行内 `TerminalPanel`。
- 在 `QuickSetupWizard` 中补充提示“向导期间已隐藏内置终端”，并将详情入口文案改为“详情（可展开）”。
- 完成验证：`npm run build` 通过。

## 回顾
- 网络探测命令的内部超时与外层结果等待必须分层设计，外层应留出标记输出余量，避免把“慢返回”误判为“无返回”。
- 快速安装向导应以步骤与详情为主视图，终端面板默认隐藏可减少干扰，但必须保留可展开的排错信息入口。

# 2026-02-28 Runtime one-click unregister + cleanup

## Plan Checklist
- [x] Replace 4 buttons in Recovery and Cleanup with one one-click button.
- [x] Implement one-click flow: unregister failure does not block cleanup and returns aggregated result codes.
- [x] Keep Historical HKCU group cleanup and collapse it by default.
- [x] Fix install status after unregister to avoid stale registered state.
- [x] Add backend status-decision tests and complete build/check validation.

## Execution Log
- Runtime page now has one danger button for unregister + cleanup.
- Flow order is unregister then cleanup; unregister failures still proceed to cleanup and report partial success.
- Historical HKCU group cleanup is now under a collapsed details panel.
- Backend unregister success now clears .register-state.json marker.
- Backend installation inspection now prioritizes registry truth for registration status.
- Added nilesoft_install unit tests for matching registry root, missing registry with stale state, and mismatched registry root.
- Verified with npm run build, cargo test --manifest-path src-tauri/Cargo.toml nilesoft_install::tests, cargo check --manifest-path src-tauri/Cargo.toml.

## Review
- Registration truth must come from system registration state; cached local state is advisory only.
- Consolidating destructive actions into one explicit flow reduces user error and branch omissions.
- [x] ��ע��ʧ�ܺ��Զ���Ȩ���Է�ע�ᣬ������ͨ/��Ȩ˫·��ϸ��

# 2026-03-02 一键维护后端统一编排 + Nilesoft 源码级评审落地

## 计划清单
- [x] 新增后端命令 `one_click_install_repair`，统一编排安装/注册/菜单同步与 HKCU 兜底
- [x] 新增后端命令 `one_click_unregister_cleanup`，统一编排反注册与清理聚合结果
- [x] 更新 Tauri command 注册与前端 API 封装
- [x] 前端 `Home.tsx` 改为调用后端聚合命令，移除本地聚合分支
- [x] 新增后端聚合逻辑测试用例
- [x] 新增 Nilesoft 源码级可行性评审文档
- [x] 运行验证：`npm run build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo check --manifest-path src-tauri/Cargo.toml`

## 执行记录
- 已按既定方案确认进入实现阶段，采用“后端统一编排 + 前端收敛调用”路线。
- 后端新增 `one_click_install_repair`，统一编排 `ensure_installed -> (必要时)提权注册 -> apply/activate -> HKCU 兜底`。
- 后端新增 `one_click_unregister_cleanup`，统一编排“先反注册后清理”，并在后端聚合 `done/partial/failed` 返回码。
- 新增聚合辅助函数 `aggregate_unregister_cleanup_result` 与结果摘要函数，保证前后端语义一致。
- 前端新增 API：`oneClickInstallRepair`、`oneClickUnregisterCleanup`，并将 `Home.tsx` 的两处一键流程改为调用后端聚合命令。
- Tauri 主进程注册新增命令：`one_click_install_repair`、`one_click_unregister_cleanup`。
- 新增文档 `docs/nilesoft_source_level_feasibility_2026-03-02.md`，沉淀源码级可行性评审结论。
- 验证通过：`cargo test --manifest-path src-tauri/Cargo.toml`（40 通过）、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run build`。

## 回顾
- 一键流程下沉到后端后，前端状态管理明显简化，错误码和文案来源也更一致。
- 对破坏性操作（反注册+清理）做后端聚合比前端拼接更稳健，测试覆盖更直接。
- 对 Nilesoft 现阶段应坚持“外部依赖 + 强治理”而非源码接管，收益/成本比更合理。

# 2026-03-04 Home.tsx upstream manual merge-back

## Plan Checklist
- [x] Re-introduce upstream winget prerequisite flow in Home.tsx while keeping npm mirror/PATH/PS1 enhancements.
- [x] Re-introduce upstream one-click backend orchestration usage for maintenance and unregister cleanup.
- [x] Re-introduce maintenance failure detail dialog + toast behavior + winget source dialog rendering.
- [x] Build and verify (`npm run build`) and summarize merged behavior.

## Execution Log
- Started diff-based manual merge from `origin/main` into current `src/pages/Home.tsx`.
- Reintroduced winget-source prompt and prerequisite guard (`ensureWingetBeforeCliInstall`) for prereq install, per-CLI install, and quick setup flows.
- Preserved current npm registry source popup logic and PS1 policy auto-fix logic while wiring upstream winget guard into the same flow.
- Switched one-click maintenance/unregister flows back to backend orchestrator commands (`oneClickInstallRepair`, `oneClickUnregisterCleanup`).
- Restored maintenance failure detail dialog behavior and toast linkage (maintenance failures auto-open detail dialog, error toast timeout back to 10s).
- Restored `<WingetInstallSourceDialog />` rendering while keeping `<NpmRegistrySourceDialog />` and user PATH repair features.
- Verified with `npm run build` (tsc + vite build passed).

## Review
- Upstream regression risk in `Home.tsx` conflict area has been addressed by explicitly restoring all missing winget and maintenance-dialog segments.
- Current local enhancements (npm mirror chooser, PATH remediation, PS1 policy remediation) remain intact after merge-back.
- Next safety step is an in-app click-through smoke test for three paths: header prereq install, single CLI install, and quick setup.

# 2026-03-05 版本 +0.0.1 与发布

## Plan Checklist
- [x] Bump patch version by +0.0.1 and sync all version manifests.
- [x] Commit current Home.tsx merge-back + version changes, then push to origin/main.
- [x] Build installers (MSI + NSIS) with tauri build and verify artifacts.
- [x] Publish GitHub Release with new tag and attach installer artifacts.

## Execution Log
- Initialized release workflow for patch bump, git push, package build, and GitHub release publish.
- Executed `npm run bump:patch`, version updated to `0.2.8`, and synced to `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/wix/main.wxs`.
- Verified frontend build via `npm run build` (passed).
- Committed and pushed `Home.tsx` merge-back + version updates to `origin/main` (`749d44d`).
- Built installers via `npm run tauri -- build`; generated:
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.8_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.8_x64-setup.exe`
- Synced `src-tauri/Cargo.lock` package version to `0.2.8`, committed and pushed (`f8b3cdb`).
- Published GitHub Release `v0.2.8` and uploaded both installer artifacts.
- Release URL: https://github.com/endearqb/execlink/releases/tag/v0.2.8

## Review
- Patch release workflow completed end-to-end: version bump, git push, package build, and release publish are consistent.
- Release now points to latest pushed commit and includes both Windows installer formats.

# 2026-03-05 重新构建安装包

## 计划清单
- [x] 记录本次构建计划并确认执行步骤
- [x] 执行版本同步校验（`npm run sync-version:check`）
- [x] 执行安装包构建（`npm run tauri -- build`）
- [x] 校验 MSI/NSIS 产物是否生成并记录路径
- [x] 回填执行记录与回顾

## 执行记录
- 已读取 `package.json`、`README.md`、`docs/release_checklist.md`，确认安装包标准构建命令为 `npm run tauri -- build`。
- 首次执行 `npm run sync-version:check` 失败：`src-tauri/tauri.conf.json` 与 `package.json` 版本不一致。
- 已执行 `npm run sync-version` 修复版本漂移，并再次执行 `npm run sync-version:check` 通过（版本一致：`0.2.8`）。
- 已执行 `npm run tauri -- build`，构建完成并生成 2 个安装包。
- 产物校验：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.8_x64_zh-CN.msi`（4509696 bytes，2026-03-05 13:12:18）
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.8_x64-setup.exe`（3325303 bytes，2026-03-05 13:12:40）

## 回顾
- 打包前先跑 `sync-version:check` 可以提前暴露版本漂移，避免构建中途失败。
- 当前新安装包已基于 `0.2.8` 成功生成，后续可直接用于分发或上传 Release。

# 2026-03-05 UV 安装源扩展 + 分阶段超时 + 全流程倒计时

## 计划清单
- [x] 扩展配置类型：新增 `UvInstallSourceMode` 与 `InstallTimeoutConfig`（前后端 + 默认值 + 迁移）
- [x] 新增 `UV` 安装源选择弹窗组件并接入 `Home.tsx`
- [x] 重构 `Home.tsx` 的 uv 安装链路：官方/清华/阿里 + 自动回退 + 错误可读化
- [x] 引入全局倒计时状态并覆盖安装/升级/卸载/快速向导全流程
- [x] 实现 `uv` 安装成功后自动重启内置终端会话并继续后续步骤
- [x] 更新 `QuickSetupWizard` 与 `TerminalPanel` 进度/倒计时展示
- [x] 更新 `CliConfigTable` 透传倒计时状态到终端面板
- [x] 更新 `install_kimi.md` 文档（uv 新源策略 + 超时/倒计时）
- [x] 运行验证：`npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml`、`cargo test --manifest-path src-tauri/Cargo.toml`
- [x] 回填执行记录与回顾

## 执行记录
- 新增配置类型并前后端同步：
- `src/types/config.ts` 增加 `UvInstallSourceMode`、`InstallTimeoutConfig`、`InstallCountdownState` 与 `DEFAULT_INSTALL_TIMEOUTS`。
- `src-tauri/src/state.rs` 增加同名字段与默认值，将 `CONFIG_VERSION` 从 `8` 升级到 `9`，并新增迁移测试 `should_migrate_v8_config_and_fill_new_uv_timeout_fields`。
- 新增 `src/components/UvInstallSourceDialog.tsx`，提供 `auto / official / tuna / aliyun` 策略选择。
- `Home.tsx` 完成 uv 安装链路重构：
- `buildEnsureUvCommandLines` 支持策略化步骤，自动链路为 `winget -> 官方脚本 -> 清华 -> 阿里`。
- 镜像安装通过 `LatestRelease` 页面链接解析 `uv-x86_64-pc-windows-msvc.zip`，提取 `uv.exe` 后复检。
- 对 `native_exit_code=-2147012867` 增加网络错误可读提示（0x80072EFD）。
- `Home.tsx` 完成超时与倒计时改造：
- 读取并应用 `config.install_timeouts`，所有关键流程改为分阶段超时。
- 新增全局倒计时状态，`runTerminalScriptAndWait`、winget 复检、安装复检、快速向导复检均显示倒计时。
- 快速向导新增“实时日志尾部（最近 40 行）”输出（终端隐藏时可见）。
- `uv` 安装成功后新增自动终端重启：`terminalCloseSession -> terminalEnsureSession`，失败返回 `uv_terminal_restart_failed`。
- 全流程接入等待结果标记：
- 仅执行安装/升级/卸载/快速向导安装路径均改为 `runTerminalScriptAndWait`（保留结果标记与超时尾日志）。
- UI 更新：
- `QuickSetupWizard.tsx` 与 `TerminalPanel.tsx` 新增倒计时展示。
- `CliConfigTable.tsx` 透传倒计时到终端面板。
- 菜单页新增 uv 策略与 6 项超时配置输入（秒）。
- 文档更新：`install_kimi.md` 已补充 uv 新源策略、自动回退链、终端重启说明和超时/倒计时说明。
- 验证结果：
- `npm run build` 通过。
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过。
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（49 passed）。

## 回顾
- 将超时配置持久化到 `AppConfig` 后，安装链路可控性显著提升；下一步可以考虑增加“恢复默认超时”按钮降低配置成本。
- 对联网安装链路做策略化回退 + 错误可读化，比单一路径重试更利于定位真实故障。
- 倒计时与日志尾部的组合能有效避免“看不到进度/卡住无反馈”的体验问题。
## 2026-03-05 taskbar native menu + no Shell group fix

### Plan checklist
- [x] Ensure normal taskbar right-click is not hijacked by minimal multiple groups.
- [x] Keep `Shift + taskbar right-click` custom menu available.
- [x] Remove `Shell` group title from taskbar fallback menu.
- [x] Keep folder/desktop `AI CLIs` group behavior unchanged.
- [x] Add regression tests and run Rust test suite.

### Execution log
- Updated `src-tauri/src/nilesoft.rs`:
- `SHELL_NSS_MINIMAL` now adds `where=!window.is_taskbar` to:
- `menu(mode="multiple" title="Pin/Unpin" ...)`
- `menu(mode="multiple" title=title.more_options ...)`
- `TASKBAR_NSS_FALLBACK` removed `title=app.name` from top taskbar menu, to avoid `Shell` group.
- Added tests:
- `should_exclude_minimal_multiple_groups_from_taskbar`
- strengthened `should_limit_taskbar_fallback_visibility_to_shift` (assert no `title=app.name`)
- Validation:
- `cargo test --manifest-path src-tauri/Cargo.toml nilesoft::tests -- --test-threads=1` passed (20/20)
- `cargo test --manifest-path src-tauri/Cargo.toml` passed (56/56)

### Review
- For taskbar compatibility, generic multiple groups must be explicitly excluded from taskbar scope.
- Taskbar fallback should avoid forcing app-level title grouping unless user explicitly wants it.

## 2026-03-05 taskbar native menu missing fix (exclude.where gate)

### Plan checklist
- [x] Ensure normal taskbar right-click fully falls back to Windows native menu.
- [x] Keep `Shift + taskbar right-click` in Nilesoft custom path.
- [x] Add regression assertion for shell-level taskbar exclusion rule.
- [x] Hot-apply runtime config and restart Explorer for immediate verification.

### Execution log
- Updated `SHELL_NSS_MINIMAL` and `SHELL_NSS_WITH_DEFAULTS`:
- `exclude.where = !process.is_explorer || (window.is_taskbar && !key.shift())`
- This makes normal taskbar context excluded from Shell processing; only `Shift` keeps Shell taskbar handling active.
- Added unit test:
- `should_exclude_normal_taskbar_context_from_shell_handling`
- Validation:
- `cargo test --manifest-path src-tauri/Cargo.toml nilesoft::tests -- --test-threads=1` passed (21/21)
- Hotfix applied to runtime `shell.nss`, then Explorer restarted.

### Review
- `vis=key.shift()` on taskbar menu alone is not enough to guarantee native fallback for normal taskbar right-click.
- A shell-level exclusion gate is required to avoid empty-intercept behavior.
# 2026-03-06 ExecLink 去 Nilesoft Rust 化重构

## 计划清单
- [x] 将本次实施计划固化到任务清单并按阶段推进。
- [x] 新增 v2 右键菜单后端模块：模型、命令编译、builder、registry writer、shell notify、service。
- [x] 将 Tauri 命令与状态模型切换到 v2 菜单链路，移除 Nilesoft 运行时依赖入口。
- [x] 更新前端类型、API、主页面与托盘交互，改为新的右键菜单状态与操作。
- [x] 清理 Nilesoft 打包资源/安装动作/文案引用。
- [x] 补充测试并完成 `cargo test`、`cargo check`、`npm run build` 验证。
- [x] 回填执行记录与回顾。

## 执行记录
- 新增 Rust 模块：
- `src-tauri/src/context_menu_model.rs`
- `src-tauri/src/command_launcher.rs`
- `src-tauri/src/context_menu_builder.rs`
- `src-tauri/src/context_menu_registry.rs`
- `src-tauri/src/shell_notify.rs`
- `src-tauri/src/context_menu_service.rs`
- 以 `context-menu-registry-schema-v2.md` 为准落地 v2 schema：
- 单组 `ExecLink.main`
- 四个固定 roots：`Directory\Background` / `Directory` / `DesktopBackground` / `Drive`
- marker：`Execlink.Owner=endearqb.execlink`、`Execlink.SchemaVersion=2`
- 子项 key：`{order:03}_{item_id}`
- 命令生成改为 Rust 内部编译：
- `auto` 优先级：`wt > pwsh > powershell`
- `%V` 作为统一工作目录占位符
- `apply_config` 改为：
- 保存配置
- 生成 `ContextMenuPlan` / `RegistryWritePlan`
- 直写 HKCU 注册表
- 校验写入结果
- 调用 `SHChangeNotify`
- 新增 Tauri 命令：
- `preview_context_menu_plan`
- `list_execlink_context_menus`
- `remove_all_execlink_context_menus`
- `notify_shell_changed`
- `restart_explorer_fallback`
- `detect_legacy_menu_artifacts`
- `migrate_legacy_hkcu_menu_to_v2`
- `cleanup_nilesoft_artifacts`
- `get_initial_state` 改为返回 `context_menu_status`
- `get_diagnostics` 改为输出 v2 菜单状态、已安装分组、legacy 残留
- 前端切换：
- `src/types/config.ts` 新增 `ContextMenuStatus`、`InstalledMenuGroup`、`LegacyArtifact`、`RegistryWritePlan`
- `src/api/tauri.ts` 接入新菜单命令
- `src/pages/Home.tsx` 的高级维护区改为：
- 右键菜单状态
- Explorer 刷新 / 兜底刷新
- 扫描已安装分组与 legacy 残留
- 迁移 legacy 菜单
- 删除当前菜单 / 清理旧残留
- `PrimaryActionsBar` 与 `UsageGuideDialog` 改为经典菜单 / Win11 “显示更多选项”表述
- 打包层清理：
- 删除 `src-tauri/resources/nilesoft.zip`
- `src-tauri/tauri.conf.json` 移除 Nilesoft 资源声明
- `src-tauri/wix/main.wxs` 移除 Nilesoft 安装/反注册/删除自定义动作与卸载选项
- 文档更新：
- `README.md`
- `docs/release_checklist.md`
- 验证结果：
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（68/68）
- `npm run build` 通过
- `npm run tauri -- build` 通过
- 产物：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.9_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.9_x64-setup.exe`

## 回顾
- 这次最关键的收益是把“菜单写入”和“Shell 生效”从 Nilesoft / PowerShell 链路中独立出来，后续再做多分组、细粒度 root 开关会轻很多。
- 当前仓库里仍保留了旧 Nilesoft 源码与部分兼容 wrapper，但它们已不再暴露为主命令，也不再参与打包资源与安装动作；后续可以继续做第二轮代码裁剪，消除剩余 warning。

# 2026-03-06 Legacy 物理删除收尾 + v2 级联菜单缺项修复

## 计划清单
- [x] 修复 v2 右键菜单父键级联兼容问题，确保组内 CLI 正常显示。
- [x] 删除后端 legacy Nilesoft / explorer / HKCU PowerShell 脚本链路。
- [x] 收口状态模型与前端 API/Home 页面到纯 v2 菜单语义。
- [x] 更新 schema 文档与经验记录。
- [x] 运行 `cargo test`、`cargo check`、`npm run build`、`npm run tauri -- build` 验证。

## 执行记录
- `context_menu_builder.rs` 的父键写入新增 `SubCommands=""`，并补单测 `should_write_subcommands_marker_on_each_parent_group_key`，修复“只显示分组名、不显示组内 CLI”的级联兼容问题。
- `tasks/context-menu-registry-schema-v2.md` 与 `docs/context-menu-registry-schema-v2.md` 已同步更新：v2 父键必须写 `SubCommands=""`，刷新链路以 `SHChangeNotify -> Explorer fallback` 为准。
- `commands.rs` 已删除旧 Nilesoft/PowerShell HKCU 链路：
- 删除命令与 wrapper：`ensure_nilesoft_installed`、`one_click_install_repair`、`request_elevation_and_register`、`attempt_unregister_nilesoft`、`one_click_unregister_cleanup`、`repair_context_menu_hkcu`、`remove_context_menu_hkcu`、`list_context_menu_groups_hkcu`、`refresh_explorer`、`activate_now`
- 删除 HKCU PowerShell 辅助：`HkcuMenuGroup`、`HkcuMenuGroupRow`、`build_hkcu_menu_script`、`build_remove_hkcu_menu_script`、`build_list_hkcu_menu_groups_script`、`parse_hkcu_menu_groups`
- `main.rs` 已移除 `mod explorer`、`mod nilesoft`、`mod nilesoft_install`；源码文件 `src-tauri/src/explorer.rs`、`src-tauri/src/nilesoft.rs`、`src-tauri/src/nilesoft_install.rs` 已物理删除。
- `Cargo.toml` 已移除仅供旧链路使用的 `walkdir`、`zip` 依赖。
- `state.rs` / `terminal.rs` / `src/types/config.ts` 已删除失效的 Nilesoft 配置字段：
- `show_nilesoft_default_menus`
- `advanced_menu_mode`
- `menu_theme_enabled`
- `InstallStatus` 已移除，前后端统一使用 `ContextMenuStatus`。
- `src/api/tauri.ts` 已删除 legacy API 别名；`Home.tsx` 已切到纯 v2 语义，直接调用 `applyConfig`、`notifyShellChanged`、`removeAllExeclinkContextMenus`、`cleanupNilesoftArtifacts`、`restartExplorerFallback`。
- 编译与验证结果：
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过，且无旧模块遗留 warning
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（34/34）
- `npm run build` 通过
- `npm run tauri -- build` 通过
- 产物：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.9_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.9_x64-setup.exe`
- `rg` 检查 `mod nilesoft`、`mod nilesoft_install`、`ensure_nilesoft_installed`、`one_click_install_repair`、`build_hkcu_menu_script` 等旧符号时返回空结果，说明源码级 legacy 清理已完成。

## 回顾
- 这次用户反馈直接暴露了一个重要平台事实：Windows 经典级联父键即使已经创建了 `shell` 子项，仍可能因为缺少 `SubCommands=""` 而不展开子菜单。
- 仅仅“逻辑上切换到 v2”还不够，必须把旧模块从编译链和 API 面彻底移除，否则后续排障会一直被过期概念和 wrapper 干扰。

# 2026-03-06 官方 CLI 图标 + Win11 菜单边界说明

## 计划清单
- [x] 为右键菜单 7 个 CLI 子项接入各自官方品牌图标资源。
- [x] 新增图标写盘模块并接入 v2 菜单 apply / migrate 链路。
- [x] 更新 Win11 经典菜单说明文案，明确仍需“显示更多选项”。
- [x] 补充测试并完成 `cargo test`、`cargo check`、`npm run build` 验证。

## 执行记录
- 新增 `src-tauri/resources/context-menu-icons/`，内置 `claude.ico`、`codex.ico`、`gemini.ico`、`kimi.ico`、`qwen-code.ico`、`opencode.ico` 六组品牌图标资源；`kimi_web` 与 `kimi` 共用同一套 Kimi 图标。
- 新增 `src-tauri/src/context_menu_icons.rs` 作为统一图标入口：
- `item_icon_target_path(cli_id)` 负责计算 `%LOCALAPPDATA%\\execlink\\context-menu-icons\\*.ico`
- `ensure_context_menu_icon_files()` 负责把内置图标写入本地 app data，并保持幂等
- `group_icon_value()` 继续返回 `execlink.exe,0`，保证父分组菜单仍显示 ExecLink 图标
- 用户二次反馈后确认了一个实际兼容性问题：`claude.ico` 与 `qwen-code.ico` 最初只是扩展名为 `.ico` 的 `JPEG/PNG` 文件，Explorer 不会稳定显示这类伪 ICO 资源。
- 现已将 `claude.ico` 与 `qwen-code.ico` 重新封装为标准多尺寸 ICO 容器，并补充单测强制检查所有内置品牌图标都必须以 `00 00 01 00` 的 ICO 文件头开头。
- `context_menu_model.rs` 已切换为“父分组用 ExecLink 图标、子 CLI 用品牌图标”的生成规则，不再让子项复用 `execlink.exe` 图标。
- `context_menu_service.rs` 已在 `apply_context_menu` 与 `migrate_legacy_to_v2` 前调用 `ensure_context_menu_icon_files()`，确保注册表写入前图标文件已经落盘；`preview_registry_write_plan` 维持纯预览，不产生副作用。
- `commands.rs` 新增启动阶段的 best-effort 图标刷新：打开应用或执行启动检查时会先尝试把本地 `%LOCALAPPDATA%\\execlink\\context-menu-icons\\` 覆盖到最新资源，降低“升级后仍沿用旧坏图标文件”的概率。
- `context_menu_builder.rs` 维持现有 `Icon` 注册表写法，但测试已明确断言：
- 父级 `Icon` 仍为 ExecLink 可执行文件图标
- 子级 `Icon` 指向 `%LOCALAPPDATA%\\execlink\\context-menu-icons\\*.ico`
- 前端和文案更新：
- `src/pages/Home.tsx`
- `src/components/PrimaryActionsBar.tsx`
- `src/components/UsageGuideDialog.tsx`
- `README.md`
- 以上入口均已明确说明：当前版本采用经典右键菜单方案，Windows 11 需在“显示更多选项”中查看，不进入 Win11 顶层新右键菜单。
- 验证结果：
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（41/41，含新增 ICO 资源校验测试）
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- `npm run build` 通过
- `npm run tauri -- build` 通过

## 回顾
- 这轮实现把“菜单品牌识别”从 `execlink.exe` 图标解绑出来了，后续即使继续调整命令生成或菜单 schema，CLI 子项图标也能保持稳定一致。
- 用户对 Win11 体验的反馈再次说明，平台边界不能只藏在文档里；必须在主页、帮助和 README 同步讲清楚，否则很容易被误判成右键菜单失效。
- 下载到本地的 favicon 资源不能只看文件扩展名；如果不校验文件头，`jpg/png` 伪装成 `.ico` 也会被打进安装包，最终只会在 Windows Explorer 里暴露成“部分图标不显示”。

# 2026-03-06 Win11 经典右键菜单显式开关

## 计划清单
- [x] 新增后端 Win11 经典右键菜单状态检测与启用/关闭命令。
- [x] 将状态接入 `InitialState` / 诊断信息，并在前端展示当前系统级开关状态。
- [x] 在菜单页增加“启用经典右键菜单 / 恢复 Win11 原生菜单”显式入口与风险提示。
- [x] 运行 `cargo test`、`cargo check`、`npm run build`、`npm run tauri -- build` 验证，并记录回顾。

## 执行记录
- 新增后端模块 `src-tauri/src/win11_classic_menu.rs`，封装当前用户级 Win11 经典右键菜单覆盖的注册表路径：
- `HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32`
- 提供 `inspect_status()`、`enable()`、`disable()` 三个入口；启用时写入空默认值，关闭时删除整个 CLSID 树，并在两侧都调用 `SHChangeNotify`。
- `state.rs` 新增 `Win11ClassicMenuStatus`，并接入：
- `InitialState`
- `DiagnosticsInfo`
- 前后端类型已同步：
- `src/types/config.ts` 新增 `Win11ClassicMenuStatus`
- `src/api/tauri.ts` 新增 `enableWin11ClassicContextMenu()` / `disableWin11ClassicContextMenu()`
- `commands.rs` 新增两个 Tauri 命令：
- `enable_win11_classic_context_menu`
- `disable_win11_classic_context_menu`
- `get_initial_state`、`get_diagnostics`、`run_startup_check` 已同时纳入该系统级状态，首页刷新后可直接看到当前是否处于经典右键菜单覆盖模式。
- `Home.tsx` 已新增独立的“Windows 11 经典菜单开关”卡片：
- 展示当前状态 chip（已启用经典菜单 / 原生顶层菜单）
- 提供“启用经典右键菜单 / 恢复 Win11 原生菜单”两个显式按钮
- 所有切换动作都走确认弹窗，并明确说明这是“当前用户级系统开关，会影响整个资源管理器右键菜单，而不只是 ExecLink”
- 卡片中保留注册表路径和“如未立即生效请用 Explorer 兜底刷新或重新登录”的提示，避免用户把平台缓存误判成开关失效。
- 验证结果：
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（44/44）
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- `npm run build` 通过
- `npm run tauri -- build` 通过
- 产物：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.9_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.9_x64-setup.exe`

## 回顾
- 这类“让 Win11 右键直接展开经典菜单”的诉求，本质上是系统级 shell 行为切换，不应和 ExecLink 自己的菜单 schema / apply_config 混在一起；做成独立显式开关更安全，也更符合用户预期。
- 状态展示必须同时说明影响范围和生效条件；否则用户很容易把 Explorer 缓存、重新登录需求或系统版本差异误判成应用逻辑 bug。

# 2026-03-06 菜单页高级选项收拢

## 计划清单
- [x] 将“终端运行器”从菜单页主区移动到“高级维护”折叠区。
- [x] 将“uv 安装源策略”和“安装超时”一起收拢到“高级维护”折叠区。
- [x] 保持现有状态与保存逻辑不变，仅调整信息架构与文案提示。
- [x] 运行前端构建验证并记录结果。

## 执行记录
- `src/pages/Home.tsx` 的菜单页主区现在只保留“启用右键菜单”主开关，并新增一条提示文案，明确告知“终端运行器 / uv 安装策略 / 安装超时”已收拢到下方“高级维护”。
- 原先位于菜单页主区顶部的三块设置已整体移入“高级维护”折叠区，作为新的“运行与安装策略”分组：
- `终端运行器`
- `uv 安装源策略`
- `安装超时（秒）`
- 本轮未改动这些设置的状态字段、默认值、保存逻辑或应用逻辑；仍然沿用原来的 `config.terminal_mode`、`config.uv_install_source_mode`、`config.install_timeouts`。
- 这样主区保留高频菜单开关，较少使用但更偏维护/调优的运行参数统一进入折叠区，菜单页层级更清晰。
- 验证结果：
- `npm run build` 通过

## 回顾
- 这类“信息架构收拢”调整优先只动展示层，不碰状态与保存逻辑，能明显降低 UI 重排带来的回归风险。

# 2026-03-06 历史版本更新记录整理

## 计划清单
- [x] 梳理仓库现有 `updatenote/`、git tag 与任务记录中的版本信息。
- [x] 新增一份按版本号组织的历史更新记录，和现有按日期记录并存。
- [x] 明确标注正式 tag/release 与仅工作区构建版本，避免版本状态混淆。
- [x] 回填执行记录与回顾。

## 执行记录
- 已核对三类历史来源：
- `updatenote/2026-02-17.md` ~ `updatenote/2026-02-26.md`
- git tag：`v0.1.0`、`v0.1.1`、`v0.2.2`、`v0.2.3`、`v0.2.4`、`v0.2.5`、`v0.2.7`
- `tasks/todo.md` 中关于 `0.2.6`、`0.2.8`、`0.2.9` 的版本升级、构建与发布记录
- 新增 `updatenote/CHANGELOG.md`，按版本号整理了从 `v0.1.0` 到 `v0.2.9` 的历史更新摘要。
- 在 changelog 中已显式区分：
- 正式 tag / GitHub Release 版本
- 仅工作区构建、当前仓库未见正式 tag 的版本（如 `v0.2.6`、`v0.2.9`）
- 这样后续发布说明可以直接引用 `updatenote/CHANGELOG.md`，而详细实施过程仍保留在原有按日期记录中。

## 回顾
- 按日期记录更适合工程实施追踪，按版本号记录更适合发布说明与用户阅读；两者并存比强行二选一更稳妥。
- 对没有正式 tag 的版本必须明确标注状态，否则很容易把“本地构建版”误读成已经公开发布的正式版本。

# 2026-03-06 推送 Git 与发布 v0.2.9

## 计划清单
- [x] 复核当前工作区、远端状态与 `v0.2.9` tag / release 状态。
- [x] 提交当前工作区改动并推送到 `origin/main`。
- [x] 创建并推送 `v0.2.9` tag。
- [x] 发布 GitHub Release 并附带 MSI / NSIS 安装包。
- [x] 回填执行记录与回顾。

## 执行记录
- 使用 `git status --short`、`git tag --list v0.2.9`、`gh release view v0.2.9` 复核现场，确认发布前远端不存在 `v0.2.9` release，本地仅剩未跟踪的 `tasks/task.md` 草稿文件。
- 将本轮功能改动整理为提交 `d27982f feat: ship rust context-menu runtime for v0.2.9`，并推送到 `origin/main`。
- 创建并推送注释标签 `v0.2.9`。
- 使用 `gh release create v0.2.9` 发布正式 Release，上传两个安装包：
- `ExecLink_0.2.9_x64_zh-CN.msi`
- `ExecLink_0.2.9_x64-setup.exe`
- 发布后通过 `gh release view v0.2.9 --json ...` 复核，确认 Release 已公开，两个资产均为 `uploaded` 状态。

## 回顾
- 本次 Git 推送与 Release 发布已完成，正式发布地址为 `https://github.com/endearqb/execlink/releases/tag/v0.2.9`。
- `tasks/task.md` 仍保持未跟踪状态，避免把临时排查记录混入正式版本提交。

# 2026-03-06 右键菜单命令转义 + CLI 可见性链路修复

## 计划清单
- [x] 修复 `Set-Location -LiteralPath` 命令拼接，避免 `%V` 替换后被 PowerShell 解析为空字符串。
- [x] 复核并修正菜单生成链路，确保菜单标题、CLI 自定义名称、CLI 开关与菜单总开关都能正确生效。
- [x] 在应用右键菜单时按当前已检测到的 CLI 裁剪可见项，避免把未安装 CLI 写入菜单。
- [x] 补充 Rust 回归测试并完成 `cargo test`、`cargo check`、`npm run build` 验证。

## 执行记录
- 根因确认：
- 当前 `pwsh/powershell` 命令模板使用了 `Set-Location -LiteralPath ''%V''; ...`。
- 当 Explorer 将 `%V` 替换为真实路径后，PowerShell 会把 `''C:\path''` 的前半部分解析为空字符串，触发 `LiteralPath` 不能为空的异常。
- `src-tauri/src/command_launcher.rs` 已改为“脚本 + 单独工作目录参数”模式：
- 旧：`-Command "Set-Location -LiteralPath ''%V''; claude"`
- 新：`-Command "& { Set-Location -LiteralPath $args[0]; claude }" "%V"`
- 这样工作目录不再嵌入 PowerShell 字符串内部，路径中的空格、中文目录名以及常见特殊字符都更稳。
- 菜单生成链路已复核：
- `enable_context_menu=false` 时仍返回空 plan，不写任何菜单
- `menu_title` 继续作为分组显示名
- `display_names.*` 继续作为各 CLI 子项显示名
- `toggles.*` 继续作为用户显式开关
- 额外新增“应用时按检测结果裁剪”的后端收口：
- `context_menu_model.rs` 新增 `filter_config_by_detected_clis`
- `context_menu_service.rs` 在 `preview/apply/migrate` 前统一读取 `detect_all_clis()`，仅把“已启用且当前已检测到”的 CLI 写入右键菜单
- 用户配置本身不会被清空，仍保留在 `config.json`；只是实际注册表菜单不再展示未安装 CLI
- `commands.rs` 已补一条更准确的成功文案：当菜单开关开启但当前没有检测到任何已安装 CLI 时，返回“未检测到已安装 CLI，已跳过生成 ExecLink 右键菜单”。
- 新增/调整 Rust 回归测试：
- `command_launcher::should_build_pwsh_style_command_with_percent_v`
- `command_launcher::should_not_wrap_working_dir_placeholder_in_empty_single_quotes`
- `context_menu_model::should_skip_undetected_clis_when_building_plan_for_detected_statuses`
- `context_menu_model::should_keep_menu_title_and_custom_cli_name_when_filtering_by_detected_status`
- `context_menu_model::should_return_empty_plan_when_no_detected_cli_is_enabled`
- 验证结果：
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过（48/48）
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- `npm run build` 通过
- `npm run tauri -- build` 通过
- 产物：
- `src-tauri/target/release/bundle/msi/ExecLink_0.2.9_x64_zh-CN.msi`
- `src-tauri/target/release/bundle/nsis/ExecLink_0.2.9_x64-setup.exe`

## 回顾
- 对 Shell 占位符（如 `%V`）不要直接嵌进 PowerShell 字符串字面量；把路径作为独立参数传入脚本，比手工包引号稳得多。
- 用户配置里的 CLI 开关应保留，但实际写入右键菜单时要再与当前检测结果取交集，否则安装包落地后很容易出现“菜单里有未安装 CLI”的误导。
