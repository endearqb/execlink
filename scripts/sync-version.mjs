#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CHECK_ONLY = process.argv.includes("--check");
const ROOT = process.cwd();

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function writeText(relativePath, content) {
  fs.writeFileSync(path.join(ROOT, relativePath), content, "utf8");
}

function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function ensureTrailingNewline(content, eol) {
  return content.endsWith(eol) ? content : `${content}${eol}`;
}

function syncCargoToml(content, version) {
  const eol = detectEol(content);
  const lines = content.split(/\r?\n/);
  let inPackageSection = false;
  let found = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\[.*\]\s*$/.test(line)) {
      inPackageSection = /^\s*\[package\]\s*$/.test(line);
      continue;
    }
    if (inPackageSection && /^\s*version\s*=/.test(line)) {
      lines[index] = `version = "${version}"`;
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error("未在 src-tauri/Cargo.toml 的 [package] 段中找到 version 字段。");
  }

  const nextContent = ensureTrailingNewline(lines.join(eol), eol);
  return { nextContent, changed: nextContent !== content };
}

function syncTauriConfig(content, version) {
  const eol = detectEol(content);
  const parsed = JSON.parse(content);
  parsed.version = version;
  const nextContent = `${JSON.stringify(parsed, null, 2)}${eol}`;
  return { nextContent, changed: nextContent !== content };
}

function syncWixTemplate(content, version) {
  const eol = detectEol(content);
  const lines = content.split(/\r?\n/);
  let updated = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*Version="[^"]*">\s*$/.test(lines[index])) {
      lines[index] = lines[index].replace(/Version="[^"]*"/, `Version="${version}"`);
      updated = true;
      break;
    }
  }

  if (!updated) {
    throw new Error("未在 src-tauri/wix/main.wxs 中找到 Product Version 行。");
  }

  const nextContent = ensureTrailingNewline(lines.join(eol), eol);
  return { nextContent, changed: nextContent !== content };
}

function main() {
  const packageJson = JSON.parse(readText("package.json"));
  const version = packageJson.version;
  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error("package.json version 非法。");
  }

  const targets = [
    {
      path: "src-tauri/Cargo.toml",
      sync: syncCargoToml
    },
    {
      path: "src-tauri/tauri.conf.json",
      sync: syncTauriConfig
    },
    {
      path: "src-tauri/wix/main.wxs",
      sync: syncWixTemplate
    }
  ];

  const drifted = [];
  for (const target of targets) {
    const currentContent = readText(target.path);
    const { nextContent, changed } = target.sync(currentContent, version);
    if (changed) {
      drifted.push({ path: target.path, nextContent });
    }
  }

  if (CHECK_ONLY) {
    if (drifted.length > 0) {
      console.error("[sync-version] 以下文件版本与 package.json 不一致：");
      for (const file of drifted) {
        console.error(`- ${file.path}`);
      }
      process.exit(1);
    }
    console.log(`[sync-version] 版本一致：${version}`);
    return;
  }

  for (const file of drifted) {
    writeText(file.path, file.nextContent);
  }

  if (drifted.length === 0) {
    console.log(`[sync-version] 无需变更，版本已一致：${version}`);
    return;
  }

  console.log(`[sync-version] 已同步版本 ${version} 到以下文件：`);
  for (const file of drifted) {
    console.log(`- ${file.path}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sync-version] 失败：${message}`);
  process.exit(1);
}
