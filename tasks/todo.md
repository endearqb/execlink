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
