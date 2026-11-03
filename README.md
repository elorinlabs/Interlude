<p align="center"><img src="apps/desktop/public/interlude-logo.svg" width="80" alt="Interlude"></p>
<h1 align="center">Interlude</h1>
<p align="center">给 Codex 账号找一个顺手的地方。</p>
<p align="center">简体中文 · <a href="README_EN.md">English</a> · <a href="https://github.com/elorinlabs/Interlude/releases/latest">下载安装</a></p>

账号多了，来回登录、查看额度、找备份都挺费时间。Interlude 把这些事放到一个窗口里，让你少做几遍重复操作。

![Interlude 主界面，演示数据](docs/screenshots/dashboard.png)

## 可以做什么

- 添加账号：浏览器登录、无痕登录，或者导入已有凭据文件；重复账号会合并。
- 切换账号和启动 Codex，继续使用本机的对话目录。
- 查看五小时和周额度、恢复时间及账号健康状态，也可以开启桌面额度小组件。
- 查看本机可读取的 Token 使用记录，批量检查账号。
- 按需保存登录信息，凭据失效后尝试恢复授权，并显示当前进度。
- 使用离线加密文件备份账号、已保存密码和验证器密钥；也可以选择本地或网盘客户端同步文件夹。
- 在首页切换中文／英文，并选择四套配色。

## 自动化

![自动化设置界面，演示数据](docs/screenshots/automation.png)

可以按需开启额度恢复问候，或设置目标接力。接力会切换账号并重新打开原对话；切换可能中断 Codex 正在执行的其他任务。自动化需要先由你配置。

## 安装

从 [Releases](https://github.com/elorinlabs/Interlude/releases/latest) 下载 Windows x64 安装包。安装前请备份已有账号数据；首次使用需要另行安装官方 Codex。安装包目前未签名，可使用发布页的 `SHA256SUMS.txt` 核对文件。

## 备份和恢复

在「备份与恢复」中选择离线完整备份，设置至少 12 位的密码并保存文件。重装系统或换电脑后，用同一文件和密码恢复。请把文件放在不会被格式化的地方，密码另行保管；没有保存过的密码或验证器密钥无法从验证码还原。

[离线备份说明](docs/offline-backup.md) · [目录备份说明](docs/local-cloud-sync.md) · [安全说明](SECURITY.md)

服务方可能要求重新登录或人工验证。Token 记录以本机可读取的数据为准，不代表账号跨设备的完整历史。

## 从源码运行

需要 Node.js、Rust、Windows MSVC 构建工具和 WebView2。

```powershell
git clone https://github.com/elorinlabs/Interlude.git
cd Interlude
npm ci
npm run dev:app
```

构建安装包：`node scripts/build-desktop-app.mjs --bundles nsis`。

作者：JingXing · [Apache-2.0](LICENSE) · [许可证说明](NOTICE)

Interlude 是独立社区工具，非 OpenAI 官方产品。截图使用演示数据。
