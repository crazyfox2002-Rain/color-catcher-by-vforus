# Color Catcher by VforUs

一个纯前端画面取色工具。导入图片、截图或视频帧后，它会在浏览器本地提取主色调，生成标准色卡，并支持复制色号和导出 PNG。

## 功能

- 拖拽、点击或 Command+V 粘贴图片
- 中英双语界面切换
- 从屏幕、窗口或浏览器标签页截屏导入
- 在 Color Catcher by VforUs 中框选区域并只分析选区
- 自动提取 4 到 10 个主色
- 显示 HEX、RGB、HSL、颜色占比和饼图
- 点击色块复制单个色号
- 一键复制整组色号
- 导出 1600 x 2000 PNG 色卡
- 适合部署到 GitHub Pages

## 截屏导入说明

截屏导入使用浏览器的 Screen Capture API。用户点击按钮后，需要在浏览器弹出的授权面板里手动选择屏幕、窗口或标签页。应用不会静默截屏，也不会上传图片。

GitHub Pages 使用 HTTPS，可以运行该功能。Chrome 和 Edge 支持较稳定。截屏后可以在 Color Catcher by VforUs 中框选需要分析的区域，再点击“分析选区”。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## GitHub Pages

仓库已包含 `.github/workflows/deploy.yml`。推送到 `main` 后，在仓库 Settings 的 Pages 页面选择 GitHub Actions 即可发布。
