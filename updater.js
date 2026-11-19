/*
 * Copyright © 2023-2026 bakajikara
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const REPO_OWNER = "bakajikara";
const REPO_NAME = "mss-jp-lyrics";

// ブランチ名を検証して正規化
function normalizeBranch(branch) {
  const trimmed = String(branch || "").trim().replace(/^\/+|\/+$/g, "");
  if (trimmed == "" || trimmed.indexOf("..") !== -1 || /[\s\\?#%]/.test(trimmed)) {
    return "main";
  }
  return trimmed;
}

// ブランチ名を URL パス用にエンコード
function encodeBranchPath(branch) {
  return normalizeBranch(branch)
    .split("/")
    .map(function (segment) {
      return encodeURIComponent(segment);
    })
    .join("/");
}

// 更新情報 JSON の取得 URL を生成
function getUpdateInfoUrl(branch) {
  const branchPath = encodeBranchPath(branch);
  return "https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/refs/heads/" + branchPath + "/version.json";
}

// 更新用アーカイブの取得 URL を生成
// 配布不要なファイルは .gitattributes の export-ignore によりアーカイブから除外される
function getUpdateZipUrl(branch) {
  const branchPath = encodeBranchPath(branch);
  return "https://github.com/" + REPO_OWNER + "/" + REPO_NAME + "/archive/refs/heads/" + branchPath + ".zip";
}

// バージョン文字列を整数配列に変換
function parseVersion(versionStr) {
  const parts = String(versionStr).trim().replace(/^v/i, "").split(".");
  while (parts.length < 3) {
    parts.push("0");
  }
  return parts.slice(0, 3).map(function (part) {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
}

// 2 つのバージョン番号を比較
function compareVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] != pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

// 最小対応バージョンを MuseScore の整数版数へ変換
function parseMscoreVersion(mscoreMin) {
  if (typeof mscoreMin == "number") {
    return mscoreMin;
  }
  if (typeof mscoreMin == "string" && mscoreMin.trim() != "") {
    const parts = parseVersion(mscoreMin);
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }
  return 0;
}

// 取得した更新情報が適用可能か判定
function isUpdateAvailable(info, currentVersion, currentMscoreVersion) {
  if (!info || !info.version) {
    return false;
  }
  if (compareVersion(info.version, currentVersion) <= 0) {
    return false;
  }
  const minVersion = parseMscoreVersion(info.mscoreMin);
  if (minVersion > 0 && currentMscoreVersion < minVersion) {
    return false;
  }
  return true;
}

// 実行中の OS 識別子を取得
function currentPlatform() {
  return Qt.platform.os;
}

// file URL をローカルのディレクトリパスへ変換
function urlToLocalPath(rawUrl) {
  const str = String(rawUrl || "");
  let decoded = str;
  try {
    decoded = decodeURIComponent(str);
  } catch (e) {
    decoded = str;
  }
  if (decoded.indexOf("file:///") == 0) {
    if (/^file:\/\/\/[a-zA-Z]:/.test(decoded)) {
      decoded = decoded.substring(8);
    } else {
      decoded = decoded.substring(7);
    }
  } else if (decoded.indexOf("file://") == 0) {
    decoded = decoded.substring(7);
  }
  decoded = decoded.replace(/\/+$/, "");
  if (currentPlatform() == "windows") {
    decoded = decoded.replace(/\//g, "\\");
  }
  return decoded;
}

// 設定ファイルのローカルパスを取得
function settingsFilePath(pluginDir) {
  const sep = currentPlatform() == "windows" ? "\\" : "/";
  return String(pluginDir || "") + sep + "settings.ini";
}

// プラグインが専用サブフォルダに配置されているか判定
function isDedicatedPluginDir(dirPath) {
  const normalized = String(dirPath || "").replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  const folderName = parts.length > 0 ? parts[parts.length - 1] : "";
  if (folderName == "" || folderName.toLowerCase() == "plugins") {
    return false;
  }
  return true;
}

// 終了コードに対応するエラーメッセージを取得
function describeUpdateExitCode(exitCode) {
  if (exitCode == 10) {
    return "更新に失敗しました。ネットワーク接続を確認してください";
  }
  if (exitCode == 12) {
    return "更新に失敗しました。パッケージを展開できませんでした";
  }
  if (exitCode == 13) {
    return "更新に失敗しました。ファイルを置き換えられませんでした";
  }
  if (exitCode == 14) {
    return "Plugins フォルダ直下では自動更新できません。専用フォルダへ配置してください";
  }
  if (exitCode == 15) {
    return "更新の準備ができていません。時間をおいて再度お試しください";
  }
  if (exitCode == 16) {
    return "プラグインフォルダ内に別の QML ファイルが存在するため更新を中止しました";
  }
  return "更新中にエラーが発生しました（コード " + exitCode + "）";
}

// Windows 用 PowerShell 更新スクリプト
// ブランチ先端のアーカイブを HTTPS で直接取得するためハッシュ検証は行わない
const UPDATE_SCRIPT_PS1 = [
  "$ErrorActionPreference = \"Stop\"",
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
  "$target = $args[0].TrimEnd(\"\\\", \"/\")",
  "$url = $args[1]",
  "$expectedVer = $args[2].Trim().TrimStart(\"v\", \"V\")",
  "if ((Split-Path -Leaf $target) -ieq \"Plugins\") {",
  "  exit 14",
  "}",
  "$otherQml = Get-ChildItem -LiteralPath $target -Filter \"*.qml\" -File | Where-Object {",
  "  $_.Name -ine \"main.qml\"",
  "}",
  "if ($otherQml) {",
  "  exit 16",
  "}",
  "Get-ChildItem -LiteralPath $env:TEMP -Filter \"mss-jp-lyrics_*\" -Directory -ErrorAction SilentlyContinue | Where-Object {",
  "  $_.LastWriteTime -lt (Get-Date).AddHours(-1)",
  "} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue",
  "$tmp = Join-Path $env:TEMP (\"mss-jp-lyrics_\" + [guid]::NewGuid().ToString(\"N\"))",
  "$zip = Join-Path $tmp \"pkg.zip\"",
  "$stage = Join-Path $tmp \"stage\"",
  "$backup = Join-Path $tmp \"backup\"",
  "try {",
  "  New-Item -ItemType Directory -Path $stage, $backup -Force | Out-Null",
  "  try {",
  "    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 30",
  "  } catch {",
  "    exit 10",
  "  }",
  "  try {",
  "    Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force",
  "  } catch {",
  "    exit 12",
  "  }",
  "  $mainQml = Get-ChildItem -LiteralPath $stage -Filter \"main.qml\" -File -Recurse | Select-Object -First 1",
  "  if (-not $mainQml) {",
  "    exit 12",
  "  }",
  "  $qmlContent = Get-Content -LiteralPath $mainQml.FullName -Raw -Encoding UTF8",
  "  if ($qmlContent -notmatch \"(?m)^\\s*version:\\s*[`\"']([^`\"']+)[`\"']\") {",
  "    exit 15",
  "  }",
  "  $pkgVer = $Matches[1].Trim().TrimStart(\"v\", \"V\")",
  "  if ($pkgVer -ne $expectedVer) {",
  "    exit 15",
  "  }",
  "  $src = $mainQml.DirectoryName",
  "  $backedUp = $false",
  "  try {",
  "    $existingItems = Get-ChildItem -LiteralPath $target | Where-Object {",
  "      -not $_.Name.StartsWith(\".\") -and $_.Name -ine \"settings.ini\"",
  "    }",
  "    foreach ($item in $existingItems) {",
  "      Copy-Item -LiteralPath $item.FullName -Destination $backup -Recurse -Force",
  "    }",
  "    $backedUp = $true",
  "    [Console]::Out.WriteLine(\"APPLYING\")",
  "    [Console]::Out.Flush()",
  "    foreach ($item in $existingItems) {",
  "      Remove-Item -LiteralPath $item.FullName -Recurse -Force",
  "    }",
  "    $now = Get-Date",
  "    $srcItems = Get-ChildItem -LiteralPath $src | Where-Object {",
  "      -not $_.Name.StartsWith(\".\") -and $_.Name -ine \"settings.ini\"",
  "    }",
  "    foreach ($item in $srcItems) {",
  "      $destItem = Join-Path $target $item.Name",
  "      Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force",
  "      (Get-Item -LiteralPath $destItem).LastWriteTime = $now",
  "      Get-ChildItem -LiteralPath $destItem -Recurse -Force | ForEach-Object {",
  "        $_.LastWriteTime = $now",
  "      }",
  "    }",
  "  } catch {",
  "    if ($backedUp) {",
  "      Get-ChildItem -LiteralPath $target | Where-Object {",
  "        -not $_.Name.StartsWith(\".\") -and $_.Name -ine \"settings.ini\"",
  "      } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue",
  "      Copy-Item -Path (Join-Path $backup \"*\") -Destination $target -Recurse -Force -ErrorAction SilentlyContinue",
  "    }",
  "    exit 13",
  "  }",
  "} finally {",
  "  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue",
  "}"
].join("\n");

// macOS および Linux 用シェル更新スクリプト
const UPDATE_COMMAND_SH = [
  "DIR=\"${1%/}\"",
  "URL=\"$2\"",
  "EXPECTED=$(printf \"%s\" \"$3\" | sed \"s/^[vV]//\")",
  "case \"$(basename \"$DIR\")\" in",
  "  [Pp][Ll][Uu][Gg][Ii][Nn][Ss]) exit 14 ;;",
  "esac",
  "for f in \"$DIR\"/*.qml \"$DIR\"/*.QML; do",
  "  if [ -e \"$f\" ]; then",
  "    case \"$(basename \"$f\")\" in",
  "      [Mm][Aa][Ii][Nn].[Qq][Mm][Ll]) ;;",
  "      *) exit 16 ;;",
  "    esac",
  "  fi",
  "done",
  "TMP_BASE=\"${TMPDIR:-/tmp}\"",
  "find \"$TMP_BASE\" -maxdepth 1 -name \"mss-jp-lyrics.*\" -type d -mmin +60 -exec rm -rf {} + 2>/dev/null || true",
  "TMP=$(mktemp -d \"$TMP_BASE/mss-jp-lyrics.XXXXXX\") || exit 10",
  "trap 'rm -rf \"$TMP\"' EXIT",
  "curl -fsSL --connect-timeout 10 --max-time 60 -o \"$TMP/pkg.zip\" \"$URL\" || exit 10",
  "mkdir -p \"$TMP/stage\" \"$TMP/backup\"",
  "unzip -q \"$TMP/pkg.zip\" -d \"$TMP/stage\" || exit 12",
  "MAIN_QML=$(find \"$TMP/stage\" -name \"main.qml\" -type f | head -n 1)",
  "if [ -z \"$MAIN_QML\" ]; then",
  "  exit 12",
  "fi",
  "PKG_VER=$(grep -E '^[[:space:]]*version:[[:space:]]*[\"'\\''][^\"'\\'']+[\"'\\'']' \"$MAIN_QML\" | head -n 1 | sed -E 's/.*version:[[:space:]]*[\"'\\'']([^\"'\\'']+)[\"'\\''].*/\\1/' | sed 's/^[vV]//')",
  "if [ \"$PKG_VER\" != \"$EXPECTED\" ]; then",
  "  exit 15",
  "fi",
  "SRC=$(dirname \"$MAIN_QML\")",
  "for item in \"$DIR\"/*; do",
  "  if [ ! -e \"$item\" ]; then",
  "    continue",
  "  fi",
  "  name=$(basename \"$item\")",
  "  if [ \"$name\" = \"settings.ini\" ]; then",
  "    continue",
  "  fi",
  "  cp -R \"$item\" \"$TMP/backup/\" || exit 13",
  "done",
  "printf \"APPLYING\\n\"",
  "for item in \"$DIR\"/*; do",
  "  if [ ! -e \"$item\" ]; then",
  "    continue",
  "  fi",
  "  name=$(basename \"$item\")",
  "  if [ \"$name\" = \"settings.ini\" ]; then",
  "    continue",
  "  fi",
  "  rm -rf \"${DIR:?}/$name\"",
  "done",
  "for item in \"$SRC\"/*; do",
  "  if [ ! -e \"$item\" ]; then",
  "    continue",
  "  fi",
  "  name=$(basename \"$item\")",
  "  if [ \"$name\" = \"settings.ini\" ]; then",
  "    continue",
  "  fi",
  "  if ! cp -R \"$item\" \"$DIR/\"; then",
  "    for cur in \"$DIR\"/*; do",
  "      if [ -e \"$cur\" ] && [ \"$(basename \"$cur\")\" != \"settings.ini\" ]; then",
  "        rm -rf \"$cur\"",
  "      fi",
  "    done",
  "    cp -R \"$TMP/backup/.\" \"$DIR/\" 2>/dev/null || true",
  "    exit 13",
  "  fi",
  "  touch \"$DIR/$name\"",
  "  if [ -d \"$DIR/$name\" ]; then",
  "    find \"$DIR/$name\" -exec touch {} +",
  "  fi",
  "done"
].join("\n");

// PowerShell 引数用に文字列をエスケープ
function escapePowerShellArg(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// 外部プロセス実行用のコマンドと引数を生成
function makeCommand(platform, pluginDir, branch, expectedVersion) {
  const zipUrl = getUpdateZipUrl(branch);
  if (platform == "windows") {
    const command = "& {\n" + UPDATE_SCRIPT_PS1 + "\n} "
      + escapePowerShellArg(pluginDir) + " "
      + escapePowerShellArg(zipUrl) + " "
      + escapePowerShellArg(expectedVersion);
    return {
      program: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle", "Hidden",
        "-Command", command
      ]
    };
  }
  return {
    program: "/bin/sh",
    args: ["-c", UPDATE_COMMAND_SH, "sh", pluginDir, zipUrl, expectedVersion]
  };
}
