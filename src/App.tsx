import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ClipboardEvent, DragEvent, KeyboardEvent, PointerEvent } from "react";
import {
  Copy,
  DownloadSimple,
  Eyedropper,
  ImageSquare,
  Monitor,
  Scissors,
  SlidersHorizontal,
  Swatches,
  Trash
} from "@phosphor-icons/react";
import { analyzeImageFile, Hsl, PaletteColor, readableTextColor, Rgb, rgbToCss, rgbToHex, rgbToHsl } from "./lib/color";
import { exportPalettePng } from "./lib/export";

type ImageMeta = {
  name: string;
  width: number;
  height: number;
  source: "upload" | "screen" | "clipboard" | "crop";
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CropMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type CropInteraction = {
  mode: CropMode;
  startPoint: { x: number; y: number };
  startRect: CropRect;
};

type ColorMarker = {
  id: number;
  label: string;
  x: number;
  y: number;
  rgb: Rgb;
  hex: string;
  hsl: Hsl;
};

const translations = {
  zh: {
    languageLabel: "语言",
    heroTitle: "画面取色",
    heroCopy: "把截图、网页或视频帧变成一组可复制、可导出的色号。",
    dropTitle: "拖入图片",
    dropHint: "点击选择，或按 Command+V 粘贴截图。",
    imageName: "图片名称",
    colorCount: "色卡数量",
    screenCapture: "截屏导入",
    waitingAuth: "等待授权",
    eyedropper: "滴管取点",
    analyzeSelection: "分析选区",
    selectionSize: "选区",
    paletteTitle: "色卡结果",
    paletteHint: "点击色块复制单个色号。使用“复制整组色号”可复制全部 HEX。",
    analyzing: "分析中",
    emptyPaletteTitle: "还没有色卡",
    emptyPaletteHint: "导入画面后显示色号和占比。",
    samplePoints: "取样点",
    exportPalette: "导出色卡",
    copyAll: "复制整组色号",
    clearData: "清空数据",
    copied: "已复制",
    allColors: "整组色号",
    otherColors: "其他颜色",
    ratio: "占比",
    canvasAlt: "取色画面",
    deleteMarker: "删除",
    copyMarker: "复制",
    roles: {
      neutral: "中性色",
      primary: "主色",
      secondary: "辅助色",
      accent: "点缀色"
    },
    errors: {
      invalidFile: "请导入 JPG、PNG、WebP 或其他常见图片格式。",
      imageAnalyzeFailed: "图片分析失败，请换一张图片。",
      screenUnsupported: "当前浏览器不支持截屏导入，请使用 Chrome 或 Edge。",
      videoReadFailed: "无法读取截屏画面。",
      captureImageFailed: "无法生成截屏图片。",
      captureCanceled: "你取消了截屏授权。",
      captureFailed: "截屏导入失败，请重新选择窗口或标签页。",
      cropUnsupported: "当前浏览器无法裁切画面。",
      cropAnalyzeFailed: "选区分析失败，请重新调整裁切框。",
      clipboardEmpty: "剪贴板里没有可读取的图片。",
      markerLimit: "最多可以添加 10 个取样点。",
      sampleFailed: "这个位置暂时无法取色，请换一个点。",
      blobFailed: "无法生成图片。"
    }
  },
  en: {
    languageLabel: "Language",
    heroTitle: "Capture Colors",
    heroCopy: "Turn screenshots, webpages, or video frames into copyable and exportable color palettes.",
    dropTitle: "Drop Image",
    dropHint: "Click to choose, or press Command+V to paste a screenshot.",
    imageName: "Image name",
    colorCount: "Palette count",
    screenCapture: "Screen Capture",
    waitingAuth: "Waiting",
    eyedropper: "Eyedropper",
    analyzeSelection: "Analyze Area",
    selectionSize: "Area",
    paletteTitle: "Palette Result",
    paletteHint: "Click a swatch to copy one color. Use “Copy All Colors” to copy every HEX value.",
    analyzing: "Analyzing",
    emptyPaletteTitle: "No Palette Yet",
    emptyPaletteHint: "Import an image to see colors and proportions.",
    samplePoints: "Sample Points",
    exportPalette: "Export Palette",
    copyAll: "Copy All Colors",
    clearData: "Clear Data",
    copied: "Copied",
    allColors: "all colors",
    otherColors: "Other Colors",
    ratio: "Ratio",
    canvasAlt: "Color source",
    deleteMarker: "Delete",
    copyMarker: "Copy",
    roles: {
      neutral: "Neutral",
      primary: "Primary",
      secondary: "Secondary",
      accent: "Accent"
    },
    errors: {
      invalidFile: "Please import a JPG, PNG, WebP, or another common image format.",
      imageAnalyzeFailed: "Image analysis failed. Please try another image.",
      screenUnsupported: "This browser does not support screen capture. Please use Chrome or Edge.",
      videoReadFailed: "Could not read the captured screen.",
      captureImageFailed: "Could not create the screen capture image.",
      captureCanceled: "Screen capture permission was canceled.",
      captureFailed: "Screen capture failed. Please choose a window or tab again.",
      cropUnsupported: "This browser cannot crop the image.",
      cropAnalyzeFailed: "Selection analysis failed. Please adjust the crop box and try again.",
      clipboardEmpty: "No readable image was found in the clipboard.",
      markerLimit: "You can add up to 10 sample points.",
      sampleFailed: "Could not sample this point. Please try another position.",
      blobFailed: "Could not create an image."
    }
  }
} as const;

type Language = keyof typeof translations;

function initialLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropInteractionRef = useRef<CropInteraction | null>(null);
  const markerEndRef = useRef<HTMLSpanElement>(null);
  const previousMarkerCountRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [colorCount, setColorCount] = useState(5);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isCropLocked, setIsCropLocked] = useState(false);
  const [isSamplerActive, setIsSamplerActive] = useState(false);
  const [markers, setMarkers] = useState<ColorMarker[]>([]);
  const [language, setLanguage] = useState<Language>(() => initialLanguage());
  const [imageBox, setImageBox] = useState<ImageBox | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const accent = palette[0]?.hex || "#8EBEAD";
  const accentText = palette[0] ? readableTextColor(palette[0].rgb) : "#111412";
  const t = translations[language];
  const colorList = useMemo(() => {
    const paletteText = palette.map((color) => color.hex).join(", ");
    const markerText = markers.map((marker) => `${marker.label}: ${marker.hex}`).join(", ");

    if (paletteText && markerText) return `${paletteText}\n${markerText}`;
    return paletteText || markerText;
  }, [markers, palette]);
  const selectedSize = useMemo(() => {
    if (!imageMeta) return null;
    if (!cropRect) return { width: imageMeta.width, height: imageMeta.height };

    return {
      width: Math.max(1, Math.round(cropRect.width * imageMeta.width)),
      height: Math.max(1, Math.round(cropRect.height * imageMeta.height))
    };
  }, [cropRect, imageMeta]);

  useEffect(() => {
    updateImageBox();
    if (!frameRef.current) return;

    const observer = new ResizeObserver(() => updateImageBox());
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [previewUrl]);

  useEffect(() => {
    function onWindowPaste(event: globalThis.ClipboardEvent) {
      if (event.defaultPrevented || !event.clipboardData) return;

      const activeElement = document.activeElement;
      const isTypingTarget =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      if (isTypingTarget) return;

      const file = findImageFile(event.clipboardData);
      if (!file) return;

      event.preventDefault();
      void analyzeSource(file, "clipboard");
    }

    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [colorCount]);

  useEffect(() => {
    const markerWasAdded = markers.length > previousMarkerCountRef.current;
    previousMarkerCountRef.current = markers.length;

    if (!markerWasAdded) return;

    window.requestAnimationFrame(() => {
      markerEndRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    });
  }, [markers.length]);

  async function analyzeSource(file: File, source: ImageMeta["source"]) {
    if (!file.type.startsWith("image/")) {
      setError(t.errors.invalidFile);
      return;
    }

    setError("");
    setIsAnalyzing(true);
    setCopied("");

    try {
      const result = await analyzeImageFile(file, colorCount);
      const nextUrl = URL.createObjectURL(file);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
      setPalette(result.colors);
      setCropRect(null);
      setIsCropLocked(false);
      setIsSamplerActive(false);
      setMarkers([]);
      setDisplayName(file.name);
      setImageMeta({
        name: file.name,
        width: result.width,
        height: result.height,
        source
      });
    } catch {
      setError(t.errors.imageAnalyzeFailed);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function captureScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(t.errors.screenUnsupported);
      return;
    }

    setError("");
    setIsCapturing(true);

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(t.errors.videoReadFailed));
      });

      await video.play();
      await waitForVideoFrame(video);

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error(t.errors.captureImageFailed);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas);
      const file = new File([blob], `screen-capture-${Date.now()}.png`, { type: "image/png" });
      await analyzeSource(file, "screen");
    } catch (nextError) {
      const isCancel = nextError instanceof DOMException && nextError.name === "NotAllowedError";
      setError(isCancel ? t.errors.captureCanceled : t.errors.captureFailed);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setIsCapturing(false);
    }
  }

  async function analyzeCrop() {
    if (!cropRect || !imageRef.current) return;

    const image = imageRef.current;
    const sx = Math.round(cropRect.x * image.naturalWidth);
    const sy = Math.round(cropRect.y * image.naturalHeight);
    const sw = Math.max(1, Math.round(cropRect.width * image.naturalWidth));
    const sh = Math.max(1, Math.round(cropRect.height * image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");

    if (!context) {
      setError(t.errors.cropUnsupported);
      return;
    }

    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await canvasToBlob(canvas);
    const baseName = imageMeta?.name.replace(/\.[a-z0-9]+$/i, "") || Date.now();
    const file = new File([blob], `cropped-${baseName}.png`, { type: "image/png" });
    setError("");
    setIsAnalyzing(true);
    try {
      const result = await analyzeImageFile(file, colorCount);
      setPalette(result.colors);
      setIsCropLocked(true);
    } catch {
      setError(t.errors.cropAnalyzeFailed);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function clearData() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setPalette([]);
    setImageMeta(null);
    setDisplayName("");
    setCropRect(null);
    setIsCropLocked(false);
    setIsSamplerActive(false);
    setMarkers([]);
    setImageBox(null);
    setError("");
    setCopied("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void analyzeSource(file, "upload");
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const file = findImageFile(event.clipboardData);
    if (!file) {
      setError(t.errors.clipboardEmpty);
      return;
    }
    event.preventDefault();
    void analyzeSource(file, "clipboard");
  }

  function onImportKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  function updateColorCount(nextColorCount: number) {
    setColorCount(nextColorCount);
    setIsCropLocked(false);
  }

  function toggleSampler() {
    if (!previewUrl) return;
    if (!isSamplerActive && markers.length >= 10) {
      setError(t.errors.markerLimit);
      return;
    }
    setError("");
    setIsSamplerActive((current) => !current);
  }

  function updateImageBox() {
    if (!frameRef.current || !imageRef.current) {
      setImageBox(null);
      return;
    }

    const frame = frameRef.current.getBoundingClientRect();
    const image = imageRef.current.getBoundingClientRect();
    const naturalWidth = imageRef.current.naturalWidth;
    const naturalHeight = imageRef.current.naturalHeight;

    if (!naturalWidth || !naturalHeight || !image.width || !image.height) {
      setImageBox(null);
      return;
    }

    const imageRatio = naturalWidth / naturalHeight;
    const frameRatio = image.width / image.height;
    let width = image.width;
    let height = image.height;
    let left = image.left;
    let top = image.top;

    if (frameRatio > imageRatio) {
      height = image.height;
      width = height * imageRatio;
      left = image.left + (image.width - width) / 2;
    } else {
      width = image.width;
      height = width / imageRatio;
      top = image.top + (image.height - height) / 2;
    }

    setImageBox({
      left: left - frame.left,
      top: top - frame.top,
      width,
      height
    });
  }

  function pointerToImagePoint(event: PointerEvent<HTMLDivElement | HTMLSpanElement>) {
    if (!imageBox || !frameRef.current) return null;

    const frame = frameRef.current.getBoundingClientRect();
    const x = clamp((event.clientX - frame.left - imageBox.left) / imageBox.width, 0, 1);
    const y = clamp((event.clientY - frame.top - imageBox.top) / imageBox.height, 0, 1);
    return { x, y };
  }

  function beginCropInteraction(mode: CropMode, event: PointerEvent<HTMLDivElement | HTMLSpanElement>) {
    if (!previewUrl || !cropRect) return;
    if (isSamplerActive) return;
    const point = pointerToImagePoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsCropLocked(false);
    cropInteractionRef.current = {
      mode,
      startPoint: point,
      startRect: cropRect
    };
  }

  function onCropPointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = cropInteractionRef.current;
    if (!interaction) return;

    const point = pointerToImagePoint(event);
    if (!point) return;

    setCropRect(resizeCropRect(interaction, point));
  }

  function onCropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!isSamplerActive) return;
    const point = pointerToImagePoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    addMarker(point);
  }

  function addMarker(point: { x: number; y: number }) {
    if (!imageRef.current) return;
    if (markers.length >= 10) {
      setError(t.errors.markerLimit);
      setIsSamplerActive(false);
      return;
    }

    const rgb = sampleImagePixel(imageRef.current, point);
    if (!rgb) {
      setError(t.errors.sampleFailed);
      return;
    }

    const nextId = nextMarkerId(markers);
    setMarkers((current) => [
      ...current,
      {
        id: nextId,
        label: `M${nextId}`,
        x: point.x,
        y: point.y,
        rgb,
        hex: rgbToHex(rgb),
        hsl: rgbToHsl(rgb)
      }
    ]);
    setCopied("");
    setError("");
  }

  function removeMarker(markerId: number) {
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setError("");
    setCopied("");
  }

  function onCropPointerUp(event: PointerEvent<HTMLDivElement>) {
    cropInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function setDefaultCrop() {
    setCropRect((current) => current || { x: 0, y: 0, width: 1, height: 1 });
  }

  const cropStyle = cropRect
    ? {
        left: `${cropRect.x * 100}%`,
        top: `${cropRect.y * 100}%`,
        width: `${cropRect.width * 100}%`,
        height: `${cropRect.height * 100}%`
      }
    : undefined;

  return (
    <main className="app-shell" style={{ "--accent": accent, "--accent-text": accentText } as CSSProperties}>
      <header className="topbar" aria-label={t.languageLabel}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-logo">
              <i />
              <i />
              <i />
              <i />
            </span>
          </span>
          <span>Color Catcher by VforUs</span>
        </div>
        <div className="language-toggle" aria-label={t.languageLabel}>
          <button className={language === "zh" ? "is-active" : ""} type="button" onClick={() => setLanguage("zh")}>
            中文
          </button>
          <button className={language === "en" ? "is-active" : ""} type="button" onClick={() => setLanguage("en")}>
            EN
          </button>
        </div>
      </header>

      <section className="workspace" aria-label={t.heroTitle}>
        <section className="canvas-panel" aria-label={t.heroTitle}>
          <div className="canvas-heading">
            <div>
              <h1>{t.heroTitle}</h1>
              <p className="intro-copy">{t.heroCopy}</p>
            </div>
            {error ? <p className="error-message">{error}</p> : null}
          </div>

          <div
            className={`source-frame ${!previewUrl ? "is-importable" : ""} ${isDragging ? "is-dragging" : ""}`}
            ref={frameRef}
            tabIndex={!previewUrl ? 0 : undefined}
            role={!previewUrl ? "button" : undefined}
            onClick={() => {
              if (!previewUrl) inputRef.current?.click();
            }}
            onKeyDown={!previewUrl ? onImportKeyDown : undefined}
            onPaste={onPaste}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input
              className="file-input"
              ref={inputRef}
              type="file"
              accept="image/*"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void analyzeSource(file, "upload");
              }}
            />
            {previewUrl ? (
              <>
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt={imageMeta?.name || t.canvasAlt}
                  onLoad={() => {
                    updateImageBox();
                    setDefaultCrop();
                  }}
                />
                {imageBox ? (
                  <div
                    className={`crop-surface ${isSamplerActive ? "is-sampling" : ""}`}
                    style={{
                      left: imageBox.left,
                      top: imageBox.top,
                      width: imageBox.width,
                      height: imageBox.height
                    }}
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                    onPointerCancel={onCropPointerUp}
                  >
                    {cropRect ? (
                      <div
                        className={`crop-rect ${isCropLocked ? "is-locked" : ""}`}
                        style={cropStyle}
                        onPointerDown={(event) => beginCropInteraction("move", event)}
                      >
                        {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as CropMode[]).map((mode) => (
                          <span
                            className={`crop-handle crop-handle-${mode}`}
                            key={mode}
                            onPointerDown={(event) => beginCropInteraction(mode, event)}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    ) : null}
                    {markers.map((marker) => (
                      <button
                        className="sample-marker"
                        key={marker.id}
                        type="button"
                        style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%`, "--marker-color": marker.hex } as CSSProperties}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeMarker(marker.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label={`${t.deleteMarker} ${marker.label} ${marker.hex}`}
                        title={`${t.deleteMarker} ${marker.label}`}
                      >
                        {marker.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="source-empty">
                <ImageSquare weight="duotone" />
                <strong>{t.dropTitle}</strong>
                <span>{t.dropHint}</span>
              </div>
            )}
          </div>

          <div className="canvas-actions">
            {imageMeta ? (
              <div className="image-meta">
                <input
                  aria-label={t.imageName}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  onBlur={() => {
                    if (!displayName.trim()) setDisplayName(imageMeta.name);
                  }}
                />
                <span>
                  {t.selectionSize} {selectedSize?.width || imageMeta.width} x {selectedSize?.height || imageMeta.height}
                </span>
              </div>
            ) : null}
            <div className="canvas-tools">
              <button className="ghost-button" type="button" onClick={() => void captureScreen()} disabled={isCapturing}>
                <Monitor weight="bold" />
                {isCapturing ? t.waitingAuth : t.screenCapture}
              </button>
              <button
                className={`ghost-button ${isSamplerActive ? "is-active" : ""}`}
                type="button"
                onClick={toggleSampler}
                disabled={!previewUrl}
              >
                <Eyedropper weight="bold" />
                {t.eyedropper}
              </button>
              <div className="canvas-control-row" aria-label={t.colorCount}>
                <div className="control-label">
                  <SlidersHorizontal weight="bold" />
                  {t.colorCount}
                </div>
                <input
                  aria-label={t.colorCount}
                  className="range-input"
                  type="range"
                  min="4"
                  max="10"
                  value={colorCount}
                  onChange={(event) => updateColorCount(Number(event.target.value))}
                />
                <span className="count-value">{colorCount}</span>
              </div>
              <button className="solid-button" type="button" onClick={() => void analyzeCrop()} disabled={!cropRect}>
                <Scissors weight="bold" />
                {t.analyzeSelection}
              </button>
            </div>
          </div>
        </section>

        <section className="palette-panel" aria-label={t.paletteTitle}>
          <div className="result-header">
            <div>
              <h2>{t.paletteTitle}</h2>
              <p>{t.paletteHint}</p>
            </div>
            {isAnalyzing ? <span className="analysis-badge">{t.analyzing}</span> : null}
          </div>

          {isAnalyzing ? <PaletteSkeleton label={t.analyzing} /> : null}

          {!isAnalyzing && palette.length === 0 ? (
            <div className="result-empty">
              <Swatches weight="duotone" />
              <strong>{t.emptyPaletteTitle}</strong>
              <span>{t.emptyPaletteHint}</span>
            </div>
          ) : null}

          {!isAnalyzing && palette.length > 0 ? (
            <>
              <PalettePie colors={palette} otherLabel={t.otherColors} ratioLabel={t.ratio} />

              <div className="palette-stack">
                {palette.map((color) => (
                  <article className="swatch-card" key={color.hex}>
                    <button
                      className="swatch-chip"
                      type="button"
                      style={{
                        background: color.hex,
                        color: readableTextColor(color.rgb)
                      }}
                      onClick={() => void copyText(color.hex, color.hex)}
                      aria-label={`${t.copyMarker} ${color.hex}`}
                    >
                      <span>{t.roles[color.role as keyof typeof t.roles] || color.role}</span>
                      <strong>{color.hex}</strong>
                    </button>
                    <div className="swatch-details">
                      <span>{rgbToCss(color.rgb)}</span>
                      <span>
                        hsl({color.hsl.h}, {color.hsl.s}%, {color.hsl.l}%)
                      </span>
                      <span>{Math.round(color.percentage * 100)}%</span>
                    </div>
                  </article>
                ))}
              </div>

              {markers.length > 0 ? (
                <section className="marker-section" aria-label={t.samplePoints}>
                  <div className="marker-heading">
                    <h3>{t.samplePoints}</h3>
                    <span>{markers.length}/10</span>
                  </div>
                  <div className="marker-stack">
                    {markers.map((marker) => (
                      <button
                        className="marker-card"
                        key={marker.id}
                        type="button"
                        onClick={() => void copyText(marker.hex, marker.label)}
                      >
                        <span className="marker-chip" style={{ background: marker.hex, color: readableTextColor(marker.rgb) }}>
                          {marker.label}
                        </span>
                        <span className="marker-info">
                          <strong>{marker.hex}</strong>
                          <small>
                            {rgbToCss(marker.rgb)} · hsl({marker.hsl.h}, {marker.hsl.s}%, {marker.hsl.l}%)
                          </small>
                        </span>
                      </button>
                    ))}
                    <span className="marker-scroll-anchor" ref={markerEndRef} aria-hidden="true" />
                  </div>
                </section>
              ) : null}

              <div className="result-actions">
                <button
                  className="solid-button"
                  type="button"
                  onClick={() => exportPalettePng(palette, displayName.trim() || imageMeta?.name || "color-catcher", language)}
                >
                  <DownloadSimple weight="bold" />
                  {t.exportPalette}
                </button>
                <button className="ghost-button" type="button" onClick={() => void copyText(colorList, t.allColors)}>
                  <Copy weight="bold" />
                  {t.copyAll}
                </button>
                <button className="ghost-button" type="button" onClick={clearData}>
                  <Trash weight="bold" />
                  {t.clearData}
                </button>
              </div>
            </>
          ) : null}

          <p className={`copy-toast ${copied ? "is-visible" : ""}`} role="status" aria-live="polite">
            {t.copied} {copied}
          </p>
        </section>
      </section>
    </main>
  );
}

function PalettePie({ colors, otherLabel, ratioLabel }: { colors: PaletteColor[]; otherLabel: string; ratioLabel: string }) {
  const visibleTotal = colors.reduce((sum, color) => sum + color.percentage, 0);
  const otherPercentage = Math.max(0, 1 - visibleTotal);
  const segments = [
    ...colors.map((color) => ({ label: color.hex, value: color.percentage, color: color.hex })),
    ...(otherPercentage >= 0.005 ? [{ label: otherLabel, value: otherPercentage, color: "#4C504B" }] : [])
  ];
  const background = segments.reduce(
    (result, color) => {
      const next = result.offset + color.value * 100;
      result.parts.push(`${color.color} ${result.offset.toFixed(2)}% ${next.toFixed(2)}%`);
      result.offset = next;
      return result;
    },
    { offset: 0, parts: [] as string[] }
  );

  return (
    <div className="palette-overview">
      <div className="pie-chart" style={{ background: `conic-gradient(${background.parts.join(", ")})` }}>
        <span>{ratioLabel}</span>
      </div>
      <div className="pie-legend">
        {segments.map((segment) => (
          <span key={segment.label}>
            <i style={{ background: segment.color }} />
            {segment.label}
            <strong>{Math.round(segment.value * 100)}%</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function PaletteSkeleton({ label }: { label: string }) {
  return (
    <div className="skeleton-stack" aria-label={label}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function waitForVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => resolve());
      return;
    }
    window.setTimeout(resolve, 300);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create an image."));
      }
    }, "image/png");
  });
}

function findImageFile(data: DataTransfer) {
  const file = Array.from(data.files).find((item) => item.type.startsWith("image/"));
  if (file) return file;

  const imageItem = Array.from(data.items).find((item) => item.type.startsWith("image/"));
  const blob = imageItem?.getAsFile();
  return blob || null;
}

function sampleImagePixel(image: HTMLImageElement, point: { x: number; y: number }): Rgb | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const sx = clamp(Math.floor(point.x * image.naturalWidth), 0, image.naturalWidth - 1);
  const sy = clamp(Math.floor(point.y * image.naturalHeight), 0, image.naturalHeight - 1);
  context.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
  const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return null;
  return { r, g, b };
}

function nextMarkerId(markers: ColorMarker[]) {
  const used = new Set(markers.map((marker) => marker.id));
  for (let id = 1; id <= 10; id += 1) {
    if (!used.has(id)) return id;
  }
  return Math.min(10, markers.length + 1);
}

function resizeCropRect(interaction: CropInteraction, point: { x: number; y: number }): CropRect {
  const minSize = 0.04;
  const { mode, startPoint, startRect } = interaction;
  const deltaX = point.x - startPoint.x;
  const deltaY = point.y - startPoint.y;
  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (mode === "move") {
    const width = startRect.width;
    const height = startRect.height;
    left = clamp(startRect.x + deltaX, 0, 1 - width);
    top = clamp(startRect.y + deltaY, 0, 1 - height);
    return { x: left, y: top, width, height };
  }

  if (mode.includes("w")) left = clamp(startRect.x + deltaX, 0, right - minSize);
  if (mode.includes("e")) right = clamp(startRect.x + startRect.width + deltaX, left + minSize, 1);
  if (mode.includes("n")) top = clamp(startRect.y + deltaY, 0, bottom - minSize);
  if (mode.includes("s")) bottom = clamp(startRect.y + startRect.height + deltaY, top + minSize, 1);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default App;
