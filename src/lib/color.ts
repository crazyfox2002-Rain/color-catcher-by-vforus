export type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type Hsl = {
  h: number;
  s: number;
  l: number;
};

export type PaletteColor = {
  rgb: Rgb;
  hex: string;
  hsl: Hsl;
  population: number;
  percentage: number;
  luminance: number;
  role: string;
};

export type ImageAnalysis = {
  colors: PaletteColor[];
  width: number;
  height: number;
};

type LabColor = Rgb & {
  l: number;
  a: number;
  labB: number;
  weight: number;
};

type Cluster = {
  l: number;
  a: number;
  labB: number;
  weight: number;
  r: number;
  g: number;
  b: number;
};

export async function analyzeImageFile(file: File, colorCount: number): Promise<ImageAnalysis> {
  const bitmap = await createImageBitmap(file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to read image pixels in this browser.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = bucketPixels(imageData.data);

  if (pixels.length < 1) {
    throw new Error("The image has too few readable colors. Please try another image.");
  }

  const displayCount = Math.max(3, Math.min(10, colorCount));
  const analysisCount = Math.max(displayCount + 4, Math.min(24, displayCount * 3));
  const clusters = runKMeans(pixels, analysisCount);
  const merged = mergeCloseClusters(clusters);
  const total = merged.reduce((sum, color) => sum + color.weight, 0);

  const colors = merged
    .sort((a, b) => b.weight - a.weight)
    .slice(0, displayCount)
    .map((cluster, index): PaletteColor => {
      const rgb = {
        r: clampByte(Math.round(cluster.r)),
        g: clampByte(Math.round(cluster.g)),
        b: clampByte(Math.round(cluster.b))
      };
      const hsl = rgbToHsl(rgb);
      return {
        rgb,
        hex: rgbToHex(rgb),
        hsl,
        population: cluster.weight,
        percentage: total > 0 ? cluster.weight / total : 0,
        luminance: relativeLuminance(rgb),
        role: colorRole(index, hsl)
      };
    });

  return {
    colors,
    width: sourceWidth,
    height: sourceHeight
  };
}

function bucketPixels(data: Uint8ClampedArray): LabColor[] {
  const buckets = new Map<string, { r: number; g: number; b: number; weight: number }>();

  for (let index = 0; index < data.length; index += 16) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];

    if (alpha < 128) continue;

    const qr = r >> 3;
    const qg = g >> 3;
    const qb = b >> 3;
    const key = `${qr},${qg},${qb}`;
    const current = buckets.get(key);

    if (current) {
      current.r += r;
      current.g += g;
      current.b += b;
      current.weight += 1;
    } else {
      buckets.set(key, { r, g, b, weight: 1 });
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const rgb = {
      r: bucket.r / bucket.weight,
      g: bucket.g / bucket.weight,
      b: bucket.b / bucket.weight
    };
    const lab = rgbToOklab(rgb);
    return {
      ...rgb,
      l: lab.l,
      a: lab.a,
      labB: lab.b,
      weight: bucket.weight
    };
  });
}

function runKMeans(points: LabColor[], k: number): Cluster[] {
  const centers = pickInitialCenters(points, k);

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const groups = centers.map(() => ({
      l: 0,
      a: 0,
      labB: 0,
      r: 0,
      g: 0,
      b: 0,
      weight: 0
    }));

    for (const point of points) {
      const nearest = nearestCenter(point, centers);
      const group = groups[nearest];
      group.l += point.l * point.weight;
      group.a += point.a * point.weight;
      group.labB += point.labB * point.weight;
      group.r += point.r * point.weight;
      group.g += point.g * point.weight;
      group.b += point.b * point.weight;
      group.weight += point.weight;
    }

    groups.forEach((group, index) => {
      if (group.weight === 0) return;
      centers[index] = {
        l: group.l / group.weight,
        a: group.a / group.weight,
        labB: group.labB / group.weight,
        r: group.r / group.weight,
        g: group.g / group.weight,
        b: group.b / group.weight,
        weight: group.weight
      };
    });
  }

  return centers.filter((center) => center.weight > 0);
}

function pickInitialCenters(points: LabColor[], k: number): Cluster[] {
  const sorted = [...points].sort((a, b) => b.weight - a.weight);
  const centers: Cluster[] = [];

  for (const point of sorted) {
    const farEnough = centers.every((center) => labDistance(point, center) > 0.055);
    if (farEnough || centers.length === 0) {
      centers.push({ ...point });
    }
    if (centers.length === k) break;
  }

  while (centers.length < k && sorted[centers.length]) {
    centers.push({ ...sorted[centers.length] });
  }

  return centers;
}

function nearestCenter(point: LabColor, centers: Cluster[]): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  centers.forEach((center, index) => {
    const distance = labDistance(point, center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function mergeCloseClusters(clusters: Cluster[]): Cluster[] {
  const sorted = [...clusters].sort((a, b) => b.weight - a.weight);
  const merged: Cluster[] = [];

  for (const cluster of sorted) {
    const match = merged.find((item) => labDistance(item, cluster) < 0.04);

    if (!match) {
      merged.push({ ...cluster });
      continue;
    }

    const weight = match.weight + cluster.weight;
    match.l = (match.l * match.weight + cluster.l * cluster.weight) / weight;
    match.a = (match.a * match.weight + cluster.a * cluster.weight) / weight;
    match.labB = (match.labB * match.weight + cluster.labB * cluster.weight) / weight;
    match.r = (match.r * match.weight + cluster.r * cluster.weight) / weight;
    match.g = (match.g * match.weight + cluster.g * cluster.weight) / weight;
    match.b = (match.b * match.weight + cluster.b * cluster.weight) / weight;
    match.weight = weight;
  }

  return merged;
}

function labDistance(a: { l: number; a: number; labB: number }, b: { l: number; a: number; labB: number }) {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.labB - b.labB;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function rgbToOklab(rgb: Rgb) {
  const r = linearRgb(rgb.r / 255);
  const g = linearRgb(rgb.g / 255);
  const b = linearRgb(rgb.b / 255);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

function linearRgb(value: number) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((value) => clampByte(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function rgbToCss({ r, g, b }: Rgb) {
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    if (max === green) h = 60 * ((blue - red) / delta + 2);
    if (max === blue) h = 60 * ((red - green) / delta + 4);
  }

  return {
    h: Math.round((h + 360) % 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function relativeLuminance({ r, g, b }: Rgb) {
  const values = [r, g, b].map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

export function readableTextColor(rgb: Rgb) {
  return relativeLuminance(rgb) > 0.48 ? "#202426" : "#F6F7F2";
}

function colorRole(index: number, hsl: Hsl) {
  if (hsl.s < 12) return "neutral";
  if (index === 0) return "primary";
  if (index <= 2) return "secondary";
  return "accent";
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
