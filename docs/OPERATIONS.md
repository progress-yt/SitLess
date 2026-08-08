# SitLess 发布与数据运维

## 本地数据

SitLess 的设置、统计、工作日记录和运行状态保存在 Electron `userData` 目录。每次写入 JSON 文件时会同步维护同名 `.bak` 文件；主文件无法解析时，应用会自动读取并恢复该备份。

设置页提供以下操作：

- 完整 JSON 备份与导入。导入后需重启应用。
- 统计 CSV 导出，文件带 UTF-8 BOM，可直接由 Excel 打开。
- 诊断 JSON 导出，包含版本、运行环境、规范化设置、运行状态和最近日志。诊断文件可能包含工作时段等本地配置，提交给他人前应先检查内容。

## 自动更新

自动更新由 `electron-updater` 提供，仅在打包版本中启用。发布前设置 `SITLESS_UPDATE_URL` 为 HTTPS 静态更新目录，并将安装包、`latest.yml` 和对应 blockmap 上传到该目录。

```powershell
$env:SITLESS_UPDATE_URL = 'https://updates.example.com/sitless'
npm run dist
```

构建时该地址会写入安装包的更新元数据。运行时可用 `SITLESS_UPDATE_URL` 临时覆盖更新地址；处于开发模式或用户关闭自动更新时，不会发起更新请求。

## Windows 代码签名

Electron Builder 会读取标准签名环境变量。证书和密码只应配置在受保护的 CI secret 中，不要写入仓库。

```powershell
$env:CSC_LINK = 'C:\secure\sitless-signing.pfx'
$env:CSC_KEY_PASSWORD = '<secret>'
$env:SITLESS_UPDATE_URL = 'https://updates.example.com/sitless'
npm run dist
```

发布流水线应在上传前验证安装包签名，例如使用 Windows SDK 的 `signtool verify /pa /v <installer>`。当前仓库只提供签名和更新基础设施，不包含证书或生产更新服务器。
