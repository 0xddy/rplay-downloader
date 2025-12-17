# <img src="icon48.png" width=33px/> RPlay Video Downloader

中文 | [English](README.en.md)

一键下载 rplay.live 视频的浏览器扩展，支持下载DRM视频和直播回放，多清晰多可选下载。

## ✨ 功能特性

- 🔍 自动检测 rplay.live 视频流
- 📊 支持多种清晰度选择（FHD/HD/SD）
- 🔐 自动处理DRM视频解密
- ⚡ 多线程高速下载
- 🌍 多语言支持

## ‼️ 注意事项
 虽然使用了 **Mux.js** 转换了容器，但是并不完美，仅防止Win资源管理器预览卡死，使用 **VLC** 播放是有问题的，建议使用兼容性更好的 **PotPlayer** 播放，你可以使用FFMPEG 执行  `ffmpeg -i input.mp4 -c copy output.mp4 -y ` 修复视频的头部信息。

## 📦 安装使用

### Chrome / Edge / 其他 Chromium 浏览器

1. **下载扩展**
   ```bash
   git clone https://github.com/0xddy/rplay-downloader.git
   cd rplay-downloader
   ```

2. **加载扩展**
   - 打开浏览器扩展管理页面
     - Chrome: `chrome://extensions/`
     - Edge: `edge://extensions/`
   - 开启右上角的 **开发者模式**
   - 点击 **加载已解压的扩展程序**
   - 选择项目文件夹

   **提示：较新的浏览器版本需要在插件详细中手动开启 `允許存取檔案網址` 开关**

3. **开始使用**
   - 访问 [rplay.live](https://rplay.live)
   - 播放任意视频
   - 点击浏览器工具栏中的扩展图标
   - 选择清晰度并下载

## 📸 预览

![screenshot](/screenshot/main-screenshot.png "screenshot")

## ⚠️ 免责声明

本扩展仅供学习交流使用，请勿用于商业用途。下载视频前请确保你拥有相应的权利。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

如果觉得这个项目有帮助，请给个 ⭐ Star 支持一下！


