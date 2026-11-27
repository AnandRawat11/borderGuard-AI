/**
 * Face and Visual Reference Matcher for Watchlist Surveillance.
 *
 * Extracts multi-zone spatial color histograms, gradient/texture orientation (HOG),
 * and zero-normalized cross-correlation (ZNCC) structural fingerprints to accurately
 * disambiguate enrolled reference subjects from arbitrary bystanders in live video.
 */

export interface ReferenceSignature {
  id: string;
  name: string;
  // Normalized 64x64 luminance matrix (mean 0, std 1)
  normLuminance: Float32Array;
  // Spatial 4x4 color histogram (HSV bins)
  spatialColor: Float32Array;
  // Spatial gradient vector (Sobel angles & magnitudes)
  gradientVector: Float32Array;
  // Dominant skin-tone and torso color metrics
  skinHue: number;
  skinSat: number;
  torsoColor: [number, number, number];
}

export interface MatchResult {
  isMatch: boolean;
  score: number;
  matchedName: string | null;
  entryId: string | null;
}

const PATCH_SIZE = 64;
// Threshold for confident reference match (0.0 to 1.0)
const MATCH_CONFIDENCE_THRESHOLD = 0.56;

// Internal cache for loaded reference signatures
const referenceCache = new Map<string, ReferenceSignature>();
const pendingLoads = new Set<string>();

// Centroid tracking for temporal smoothing
interface TrackedMatch {
  cx: number;
  cy: number;
  entryId: string;
  smoothedScore: number;
  lastSeen: number;
}
const trackedSubjects: TrackedMatch[] = [];

/**
 * Pre-warm or update reference signature for a watchlist entry.
 */
export async function enrollReferencePhoto(id: string, name: string, photoUrl: string): Promise<boolean> {
  if (referenceCache.has(id)) return true;
  if (pendingLoads.has(id)) return false;

  pendingLoads.add(id);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = e => reject(e);
      img.src = photoUrl;
    });

    const sig = extractSignatureFromImage(img, id, name);
    if (sig) {
      referenceCache.set(id, sig);
      return true;
    }
  } catch (err) {
    console.warn(`[FaceMatcher] Failed to extract reference signature for ${name} (${id}):`, err);
  } finally {
    pendingLoads.delete(id);
  }
  return false;
}

/**
 * Evict deactivated or deleted reference signatures.
 */
export function removeReferenceSignature(id: string): void {
  referenceCache.delete(id);
  pendingLoads.delete(id);
}

/**
 * Extract feature signature from an Image or Canvas.
 */
function extractSignatureFromImage(
  source: HTMLImageElement | HTMLCanvasElement,
  id: string,
  name: string
): ReferenceSignature | null {
  const canvas = document.createElement('canvas');
  canvas.width = PATCH_SIZE;
  canvas.height = PATCH_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const sw = 'videoWidth' in source ? (source as any).videoWidth : source.width;
  const sh = 'videoHeight' in source ? (source as any).videoHeight : source.height;
  if (!sw || !sh) return null;

  // Render centered portrait/head crop to 64x64
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, PATCH_SIZE, PATCH_SIZE);
  const imgData = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE);
  return buildSignatureFromImageData(imgData, id, name);
}

/**
 * Extract feature signature from a candidate person's bounding box in a canvas.
 */
function extractCandidateSignature(
  sourceCanvas: HTMLCanvasElement,
  bx: number,
  by: number,
  bw: number,
  bh: number
): ReferenceSignature | null {
  const canvas = document.createElement('canvas');
  canvas.width = PATCH_SIZE;
  canvas.height = PATCH_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Upper 55% of the person box focuses on head, face, hair and upper torso
  const cropX = Math.max(0, bx + bw * 0.1);
  const cropY = Math.max(0, by);
  const cropW = Math.min(sourceCanvas.width - cropX, bw * 0.8);
  const cropH = Math.min(sourceCanvas.height - cropY, bh * 0.55);

  if (cropW < 8 || cropH < 8) return null;

  ctx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, PATCH_SIZE, PATCH_SIZE);
  const imgData = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE);
  return buildSignatureFromImageData(imgData, 'candidate', 'candidate');
}

/**
 * Builds mathematical signature (ZNCC luminance, 4x4 spatial HSV, and Sobel gradient).
 */
function buildSignatureFromImageData(
  imgData: ImageData,
  id: string,
  name: string
): ReferenceSignature {
  const data = imgData.data;
  const totalPixels = PATCH_SIZE * PATCH_SIZE;
  const normLuminance = new Float32Array(totalPixels);

  let sumLum = 0;
  let sumSqLum = 0;

  let skinHueSum = 0;
  let skinSatSum = 0;
  let skinCount = 0;

  let torsoR = 0, torsoG = 0, torsoB = 0, torsoCount = 0;

  // 1. Compute grayscale luminance and basic color statistics
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    normLuminance[i] = lum;
    sumLum += lum;
    sumSqLum += lum * lum;

    const y = Math.floor(i / PATCH_SIZE);
    // Upper-middle region: skin tone sampling
    if (y > 10 && y < 40) {
      const { h, s, v } = rgbToHsv(r, g, b);
      if ((h <= 30 || h >= 335) && s >= 0.15 && s <= 0.75 && v >= 0.20) {
        skinHueSum += h;
        skinSatSum += s;
        skinCount++;
      }
    }
    // Bottom region: torso/clothing sampling
    if (y >= 45) {
      torsoR += r;
      torsoG += g;
      torsoB += b;
      torsoCount++;
    }
  }

  // Normalize luminance for Zero-Normalized Cross-Correlation (mean 0, std 1)
  const meanLum = sumLum / totalPixels;
  const variance = Math.max(1, sumSqLum / totalPixels - meanLum * meanLum);
  const stdLum = Math.sqrt(variance);

  for (let i = 0; i < totalPixels; i++) {
    normLuminance[i] = (normLuminance[i] - meanLum) / stdLum;
  }

  // 2. Spatial 4x4 grid color moments (16 cells x 3 channels = 48 values)
  const cells = 4;
  const cellSize = PATCH_SIZE / cells;
  const spatialColor = new Float32Array(cells * cells * 3);

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      let cellH = 0, cellS = 0, cellV = 0, cellCount = 0;
      for (let py = cy * cellSize; py < (cy + 1) * cellSize; py++) {
        for (let px = cx * cellSize; px < (cx + 1) * cellSize; px++) {
          const idx = (py * PATCH_SIZE + px) * 4;
          const { h, s, v } = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
          cellH += h / 360;
          cellS += s;
          cellV += v;
          cellCount++;
        }
      }
      const cellIdx = (cy * cells + cx) * 3;
      spatialColor[cellIdx] = cellCount > 0 ? cellH / cellCount : 0;
      spatialColor[cellIdx + 1] = cellCount > 0 ? cellS / cellCount : 0;
      spatialColor[cellIdx + 2] = cellCount > 0 ? cellV / cellCount : 0;
    }
  }

  // 3. Sobel gradient orientations across 4 quadrants (4 quadrants x 8 bins = 32 values)
  const gradientVector = new Float32Array(32);
  for (let y = 1; y < PATCH_SIZE - 1; y++) {
    for (let x = 1; x < PATCH_SIZE - 1; x++) {
      const idx = y * PATCH_SIZE + x;
      // Sobel horizontal & vertical gradients on luminance
      const gx =
        -normLuminance[idx - PATCH_SIZE - 1] + normLuminance[idx - PATCH_SIZE + 1] -
        2 * normLuminance[idx - 1] + 2 * normLuminance[idx + 1] -
        normLuminance[idx + PATCH_SIZE - 1] + normLuminance[idx + PATCH_SIZE + 1];

      const gy =
        -normLuminance[idx - PATCH_SIZE - 1] - 2 * normLuminance[idx - PATCH_SIZE] - normLuminance[idx - PATCH_SIZE + 1] +
        normLuminance[idx + PATCH_SIZE - 1] + 2 * normLuminance[idx + PATCH_SIZE] + normLuminance[idx + PATCH_SIZE + 1];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 0.05) {
        let angle = Math.atan2(gy, gx) + Math.PI; // 0 to 2PI
        let bin = Math.floor((angle / (2 * Math.PI)) * 8) % 8;
        const qx = x < PATCH_SIZE / 2 ? 0 : 1;
        const qy = y < PATCH_SIZE / 2 ? 0 : 1;
        const quad = qy * 2 + qx;
        gradientVector[quad * 8 + bin] += mag;
      }
    }
  }

  // L2-normalize gradient vector
  let gradNormSq = 0;
  for (let i = 0; i < gradientVector.length; i++) gradNormSq += gradientVector[i] * gradientVector[i];
  if (gradNormSq > 0) {
    const gradNorm = Math.sqrt(gradNormSq);
    for (let i = 0; i < gradientVector.length; i++) gradientVector[i] /= gradNorm;
  }

  return {
    id,
    name,
    normLuminance,
    spatialColor,
    gradientVector,
    skinHue: skinCount > 0 ? skinHueSum / skinCount : 20,
    skinSat: skinCount > 0 ? skinSatSum / skinCount : 0.35,
    torsoColor: torsoCount > 0
      ? [torsoR / torsoCount, torsoG / torsoCount, torsoB / torsoCount]
      : [128, 128, 128],
  };
}

/**
 * Compare two signatures and return a normalized similarity score [0, 1].
 */
function computeSignatureSimilarity(cand: ReferenceSignature, ref: ReferenceSignature): number {
  // 1. Zero-Normalized Cross-Correlation (ZNCC) on luminance
  let dotLum = 0;
  const len = cand.normLuminance.length;
  for (let i = 0; i < len; i++) {
    dotLum += cand.normLuminance[i] * ref.normLuminance[i];
  }
  const zncc = Math.max(0, dotLum / len);

  // 2. Spatial color cosine similarity
  let dotCol = 0, normCandCol = 0, normRefCol = 0;
  for (let i = 0; i < cand.spatialColor.length; i++) {
    dotCol += cand.spatialColor[i] * ref.spatialColor[i];
    normCandCol += cand.spatialColor[i] * cand.spatialColor[i];
    normRefCol += ref.spatialColor[i] * ref.spatialColor[i];
  }
  const colSim = (normCandCol > 0 && normRefCol > 0)
    ? Math.max(0, dotCol / (Math.sqrt(normCandCol) * Math.sqrt(normRefCol)))
    : 0;

  // 3. Gradient structure cosine similarity
  let dotGrad = 0;
  for (let i = 0; i < cand.gradientVector.length; i++) {
    dotGrad += cand.gradientVector[i] * ref.gradientVector[i];
  }
  const gradSim = Math.max(0, Math.min(1, dotGrad));

  // 4. Skin and torso color harmony
  const skinDiff = Math.abs(cand.skinHue - ref.skinHue) / 180;
  const skinSim = Math.max(0, 1 - skinDiff);

  const [cr, cg, cb] = cand.torsoColor;
  const [rr, rg, rb] = ref.torsoColor;
  const torsoDist = Math.sqrt((cr - rr) ** 2 + (cg - rg) ** 2 + (cb - rb) ** 2) / 441.67;
  const torsoSim = Math.max(0, 1 - torsoDist);

  // Composite weighted score
  const composite = (
    0.35 * colSim +
    0.25 * zncc +
    0.20 * gradSim +
    0.10 * skinSim +
    0.10 * torsoSim
  );

  return Math.min(1.0, Math.max(0.0, composite));
}

/**
 * Disambiguates all detected persons in the current frame against active reference entries.
 * Returns a map of index -> MatchResult so only true matches get the name, and others get 'PERSON'.
 */
export function matchDetectedPersons(
  canvas: HTMLCanvasElement,
  personBboxes: Array<{ bbox: [number, number, number, number]; index: number; score: number }>,
  activeEntries: Array<{ id: string; name: string; photoUrl?: string | null }>
): Map<number, MatchResult> {
  const results = new Map<number, MatchResult>();
  const now = Date.now();

  // If no active references or no persons detected, return plain non-matches
  if (personBboxes.length === 0 || activeEntries.length === 0) {
    for (const p of personBboxes) {
      results.set(p.index, { isMatch: false, score: 0, matchedName: null, entryId: null });
    }
    return results;
  }

  // Pre-fetch/enroll any entries that have photos
  for (const entry of activeEntries) {
    if (entry.photoUrl && !referenceCache.has(entry.id)) {
      void enrollReferencePhoto(entry.id, entry.name, entry.photoUrl);
    }
  }

  // Compute similarities for all candidates
  const candidates: Array<{
    personIndex: number;
    cx: number;
    cy: number;
    bestMatchRef: ReferenceSignature | null;
    bestScore: number;
  }> = [];

  for (const p of personBboxes) {
    const [bx, by, bw, bh] = p.bbox;
    const candSig = extractCandidateSignature(canvas, bx, by, bw, bh);
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    let bestScore = 0;
    let bestRef: ReferenceSignature | null = null;

    if (candSig) {
      for (const entry of activeEntries) {
        const refSig = referenceCache.get(entry.id);
        if (!refSig) continue;

        const sim = computeSignatureSimilarity(candSig, refSig);
        if (sim > bestScore) {
          bestScore = sim;
          bestRef = refSig;
        }
      }
    }

    candidates.push({
      personIndex: p.index,
      cx,
      cy,
      bestMatchRef: bestRef,
      bestScore,
    });
  }

  // Sort candidates by bestScore descending: the single candidate closest to the reference
  // claims the match; any other people remain plain 'PERSON'
  candidates.sort((a, b) => b.bestScore - a.bestScore);

  const matchedRefIds = new Set<string>();

  for (const cand of candidates) {
    const ref = cand.bestMatchRef;
    if (ref && cand.bestScore >= MATCH_CONFIDENCE_THRESHOLD && !matchedRefIds.has(ref.id)) {
      // Find temporal smoothed score
      let smoothed = cand.bestScore;
      const prevTrack = trackedSubjects.find(
        t => t.entryId === ref.id && Math.hypot(t.cx - cand.cx, t.cy - cand.cy) < 120
      );
      if (prevTrack && now - prevTrack.lastSeen < 2000) {
        smoothed = 0.65 * cand.bestScore + 0.35 * prevTrack.smoothedScore;
        prevTrack.cx = cand.cx;
        prevTrack.cy = cand.cy;
        prevTrack.smoothedScore = smoothed;
        prevTrack.lastSeen = now;
      } else {
        trackedSubjects.push({
          cx: cand.cx,
          cy: cand.cy,
          entryId: ref.id,
          smoothedScore: cand.bestScore,
          lastSeen: now,
        });
      }

      matchedRefIds.add(ref.id);
      results.set(cand.personIndex, {
        isMatch: true,
        score: smoothed,
        matchedName: ref.name,
        entryId: ref.id,
      });
    } else {
      results.set(cand.personIndex, {
        isMatch: false,
        score: cand.bestScore,
        matchedName: null,
        entryId: null,
      });
    }
  }

  // Clean stale tracks older than 4 seconds
  for (let i = trackedSubjects.length - 1; i >= 0; i--) {
    if (now - trackedSubjects[i].lastSeen > 4000) {
      trackedSubjects.splice(i, 1);
    }
  }

  return results;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return { h, s, v };
}
