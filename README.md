# RPlay Video Downloader

用于下载 `rplay.live` VOD/回放视频的 Chromium 扩展。

扩展会在浏览器后台读取 HLS，将输入中的编码数据直接换封装为 MP4，不进行视频或音频转码，也不要求用户额外安装 FFmpeg。MP4 不兼容时，符合条件的传统 MPEG-TS 播放列表会自动回退保存为 `.ts`。

## 主要功能

- 自动检测 RPlay HLS master playlist，并展示可用分辨率与码率。
- 使用 MediaBunny Encoded Packet API 无转码换封装 MP4。
- 使用 MV3 Offscreen Document 执行任务，刷新或关闭来源页面不会中断下载。
- 每次执行一个媒体任务，其他任务自动排队。
- HLS 分片最多 5 路并发，并使用 64 MiB 预取预算控制内存占用。
- MP4 输出以 4 MiB chunk 持续写入 OPFS，不在 JavaScript 内存中保存完整文件。
- 自动处理常见错误旋转元数据，保持输出画面方向与所选分辨率一致。
- 文件名优先使用页面视频标题，并在保存时替换 Windows 非法字符。
- MP4 兼容性失败时可自动回退传统 TS，界面会保留回退原因。
- TS 回退支持 AES-128 显式/隐式 IV、密钥轮换与 `METHOD=NONE`。
- Background、Offscreen、Popup、Content Script 均使用扩展内的本地 bundle，不加载远程 JavaScript。

## 工作流程

```text
RPlay 页面
  └─ Content Script：读取视频标题、显示检测提示
       └─ Background：检测 master、管理任务队列与状态
            └─ Offscreen Download Session
                 ├─ MP4 Remux Pipeline
                 │    └─ HLS packets → MediaBunny → OPFS MP4
                 └─ TS Fallback Pipeline
                      └─ 下载/解密/排序 → OPFS TS
                           └─ chrome.downloads 保存最终文件
```

任务状态统一为：

```text
queued → preparing → remuxing ─────────→ saving → completed
                         └→ fallback_ts ───┘
任意活动阶段 ───────────────────────────→ error
```

## 环境要求

- Chrome 或 Edge 116+
- Node.js 20+
- pnpm 11+

## 构建与安装

```bash
pnpm install
pnpm check
```

`pnpm check` 会依次执行静态检查、单元测试和生产构建。

构建完成后：

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目根目录，而不是 `dist/` 目录。
5. 打开 RPlay 视频播放页并开始播放。
6. 点击扩展图标，选择清晰度后下载。

修改源码后，需要重新执行：

```bash
pnpm build
```

然后在扩展管理页点击“重新加载”。

## 项目结构

```text
.
├─ manifest.json                 Chrome MV3 清单
├─ popup.html / popup.js         Popup 页面与源码入口
├─ content.js                    Content Script 源码入口
├─ offscreen.html                Offscreen Document 页面
├─ src/
│  ├─ background.js              扩展事件入口、队列和浏览器下载生命周期
│  ├─ task-store.js              任务持久化、公开字段过滤和状态流转校验
│  ├─ video-detector.js          RPlay master 识别与视频元数据检测
│  ├─ protocol.js                共用任务阶段和运行时消息协议
│  ├─ media.js                   稳定源指纹与媒体大小估算
│  ├─ offscreen.js               Offscreen 单任务会话编排
│  ├─ mp4-remux.js               MP4 无转码换封装流水线
│  ├─ ts-fallback.js             TS 下载、AES-128 解密和顺序写入流水线
│  ├─ hls-prefetch.js            HLS Range 缓存、并发预取和字节预算
│  ├─ hls.js                     HLS 解析、IV、旋转和顺序处理工具
│  ├─ network.js                 携带凭据的请求、取消、流量统计和重试
│  ├─ opfs.js                    OPFS 临时文件生命周期
│  ├─ progress.js                速度与阶段进度上报
│  ├─ naming.js                  标题规范化与文件名生成
│  └─ errors.js                  稳定错误分类与 TS 回退策略
├─ scripts/
│  ├─ build.mjs                  esbuild 四入口打包与无转码校验
│  └─ check.mjs                  语法、国际化和本地脚本检查
├─ test/                         单元与回归测试
└─ dist/                         构建产物
```

构建会生成：

- `dist/background.js`
- `dist/offscreen.js`
- `dist/popup.js`
- `dist/content.js`

MediaBunny 会被打包进 `dist/offscreen.js`。`node_modules`、esbuild 和 Vitest 都不会被 Chrome 扩展在运行时直接加载。

## 内存与磁盘策略

- MP4/TS 最终输出持续写入 OPFS，内存占用不会随最终文件大小等比例增长。
- MediaBunny 输入缓存配置为 64 MiB。
- HLS 预取预算配置为 64 MiB；正在进行的并发请求可能造成短暂超出预算。
- MP4 输出 chunk 为 4 MiB。
- TS 回退最多同时处理 5 个分片，并按播放列表顺序写入。
- 浏览器保存完成或中断后，会撤销 Object URL 并删除 OPFS 临时文件。
- Offscreen 启动时会清理上次异常退出遗留的临时文件。

总体文件大小不会直接导致整个文件进入内存，但异常巨大的单分片或极长视频仍应进行实际压力测试。

## MP4 与 TS 边界

MP4 主要成功路径为 H.264 + AAC。其他编码只有在 MediaBunny MP4 muxer 明确支持时才会输出 MP4。

MP4 使用普通非 fragmented 模式和 `fastStart: false`：

- `moov` 位于文件末尾。
- 支持随机写入 OPFS。
- 不额外缓存整个视频来实现网页渐进播放。

TS 回退仅支持：

- VOD/回放播放列表。
- 传统 MPEG-TS 分片。
- 单播放列表音视频复用 TS。
- 未加密或 AES-128 加密。

TS 回退不支持：

- DRM/CDM、SAMPLE-AES 或非 identity `KEYFORMAT`。
- fMP4/CMAF、`EXT-X-MAP`。
- `EXT-X-BYTERANGE`。
- 独立音频与视频播放列表合并。
- 无限直播录制。

这些情况会返回明确错误，不会生成扩展名为 `.ts` 但实际不可播放的文件。

## 本地代码与隐私

- 扩展不使用 CDN、远程模块、远程字体或运行时远程 JavaScript。
- 静态检查会拒绝 HTML 或 Manifest 中的远程脚本地址。
- 运行时联网仅用于请求 RPlay 的 HLS 清单、媒体分片和 AES-128 密钥。
- master、media、audio URL 和密钥信息不会发送给 Popup，也不会包含在公开任务对象中。
- 任务使用不暴露签名 URL 的稳定源指纹进行去重。

## 开发命令

```bash
# 静态检查
pnpm lint

# 单元测试
pnpm test

# 构建四个扩展入口
pnpm build

# 执行完整验收
pnpm check
```

当前测试覆盖：

- master/media playlist 解析。
- HLS Range 响应与无 `.m3u8` 后缀 master。
- 并发预取和字节预算背压。
- AES-128 显式/隐式 IV、密钥轮换与 `METHOD=NONE`。
- 分片乱序完成后的顺序写入。
- 旋转元数据修正。
- 稳定源指纹、文件名和任务状态流转。
- 网络有限重试与取消行为。
- 构建产物不实例化 WebCodecs encoder/decoder。
- HTML 与 Manifest 不引用远程脚本。

## 常见问题

### 修改代码后扩展没有变化

先执行 `pnpm build`，再到扩展管理页重新加载。Chrome 实际运行的是 `dist/` 中的构建产物。

### 扩展错误页仍显示旧的 Range 警告

Chrome 会保留历史扩展警告。重新构建并加载后，可以先在错误页点击“全部清除”，再执行一次新下载确认。

### 为什么最终保存为 TS

只有 MP4 换封装被判断为编码、轨道或时间戳兼容性失败时才会尝试 TS 回退。网络、鉴权、清单或密钥错误不会触发无意义的重复下载。

## 免责声明

本扩展仅供学习交流使用。下载内容前请确保你拥有相应权利，并遵守服务条款及当地法律。

第三方软件声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
