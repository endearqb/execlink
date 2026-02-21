# AI CLI 官方安装方式整理（截至 2026-02-19）

本文用于给 `ExecLink` 提供“安装指引”依据。  
信息来源优先官方文档和官方仓库，末尾附链接。

## 1. 汇总表

| CLI | Windows 推荐安装 | 其他常见安装 | 前置依赖 | 需要先手动装 Python/Node 吗 |
|---|---|---|---|---|
| Kimi Code CLI | `Invoke-RestMethod https://code.kimi.com/install.ps1 \| Invoke-Expression` | `curl -LsSf https://code.kimi.com/install.sh \| bash` | 官方安装脚本会先安装 `uv`，再通过 `uv` 安装 Kimi | 通常不需要手动预装 Python；官方未要求手动安装，且说明支持 Python 3.12-3.14 |
| Claude Code | `irm https://claude.ai/install.ps1 \| iex` 或 `winget install Anthropic.ClaudeCode` | `curl -fsSL https://claude.ai/install.sh \| bash`、`brew install --cask claude-code` | 账号登录能力 | 官方推荐的原生安装方式不要求先装 Node.js；`npm` 方案已标记 deprecated |
| Gemini CLI | `npm install -g @google/gemini-cli` | `npx @google/gemini-cli`、`brew install gemini-cli` | Node.js 20+ | 需要 Node.js（官方系统要求） |
| Codex CLI | `npm i -g @openai/codex`（Windows 建议在 WSL） | Homebrew（macOS/Linux） | 使用 npm 时需 npm/Node；首次运行需登录 | 使用 npm 安装时需要 Node.js；官方提示 Windows 支持仍为 experimental |
| Qwen Code（qwencode） | `npm install -g @qwen-code/qwen-code@latest` | `brew install qwen-code` | Node.js 20+；首次进入后需认证（如 `/auth`） | 需要 Node.js 20+ |
| OpenCode（opencode） | 推荐 WSL；原生可用 `choco install opencode` 或 `npm install -g opencode-ai` | `curl -fsSL https://opencode.ai/install \| bash`、`scoop install opencode`、`brew install anomalyco/tap/opencode` | 模型提供商凭据（API Key 或登录） | `npm` 方案需要 Node.js；脚本/包管理器方案通常不要求手动装 Node.js |

## 2. 建议用于 ExecLink 的安装指引文本

### 2.1 Kimi / Kimi Web

- 复制命令（Windows）：
```powershell
Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression
```
- 打开说明：
  - https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html

### 2.2 Claude Code

- 复制命令（Windows）：
```powershell
irm https://claude.ai/install.ps1 | iex
```
- 可选命令：
```powershell
winget install Anthropic.ClaudeCode
```
- 打开说明：
  - https://code.claude.com/docs/en/quickstart

### 2.3 Gemini CLI

- 复制命令：
```powershell
npm install -g @google/gemini-cli
```
- 打开说明：
  - https://google-gemini.github.io/gemini-cli/

### 2.4 Codex CLI

- 复制命令：
```powershell
npm i -g @openai/codex
```
- 打开说明：
  - https://developers.openai.com/codex/cli

### 2.5 Qwen Code（qwencode）

- 复制命令：
```powershell
npm install -g @qwen-code/qwen-code@latest
```
- 开始使用：
```powershell
qwen
```
进入后可执行：
```text
/auth
/help
```
- 打开说明：
  - https://qwenlm.github.io/qwen-code-docs/getting-started/quickstart.html
  - https://qwenlm.github.io/qwen-code-docs/getting-started/authentication.html

### 2.6 OpenCode（opencode）

- 复制命令（Windows 原生）：
```powershell
npm install -g opencode-ai
```
- 可选命令（Windows 包管理器）：
```powershell
choco install opencode
scoop install opencode
```
- 可选命令（WSL/macOS/Linux）：
```bash
curl -fsSL https://opencode.ai/install | bash
```
- 开始使用：
```powershell
opencode
opencode run "Explain this repository"
```
进入后可执行：
```text
/init
/connect
```
- 打开说明：
  - https://opencode.ai/docs/
  - https://opencode.ai/docs/cli/

## 3. 兼容性与提示策略建议

- 对 `Gemini` 与 `Codex`：在提示中明确“此安装方式依赖 Node.js 环境”。
- 对 `Kimi`：提示“官方脚本会处理 uv 与安装流程”；若企业环境限制脚本执行，给出文档链接与手动安装路径。
- 对 `Codex`：Windows 上提示“官方将 Windows 标记为 experimental，推荐 WSL 环境以获得更稳定体验”。
- 对 `Claude`：优先引导原生安装或 `winget`；把 npm 路径降级为“兼容方案”。
- 对 `Qwen Code`：提示“需要 Node.js 20+；首次运行建议执行 `/auth` 完成认证”。
- 对 `OpenCode`：提示“Windows 官方推荐在 WSL 下使用；若原生 Windows 安装，优先给出 choco/scoop/npm 路径，并提醒先完成 `/connect` 或提供 API Key”。

## 4. 来源

- Kimi Code CLI Getting Started:
  - https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html
- Claude Code Quickstart:
  - https://code.claude.com/docs/en/quickstart
- Claude Code 官方仓库 README:
  - https://github.com/anthropics/claude-code
- Gemini CLI 文档:
  - https://google-gemini.github.io/gemini-cli/
- Gemini CLI 官方仓库:
  - https://github.com/google-gemini/gemini-cli
- Codex CLI 文档:
  - https://developers.openai.com/codex/cli
- Codex 官方仓库:
  - https://github.com/openai/codex
- Qwen Code Quickstart:
  - https://qwenlm.github.io/qwen-code-docs/getting-started/quickstart.html
- Qwen Code Authentication:
  - https://qwenlm.github.io/qwen-code-docs/getting-started/authentication.html
- Qwen Code 官方仓库:
  - https://github.com/QwenLM/qwen-code
- OpenCode 文档首页:
  - https://opencode.ai/docs/
- OpenCode CLI 文档:
  - https://opencode.ai/docs/cli/
- OpenCode 官方仓库:
  - https://github.com/sst/opencode
