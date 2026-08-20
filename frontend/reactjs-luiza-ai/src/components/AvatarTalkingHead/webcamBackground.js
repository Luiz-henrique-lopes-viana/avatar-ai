import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

// Self-hosted MediaPipe assets (see public/mediapipe), same as headTracking.js.
const WASM_PATH = "/mediapipe/wasm";
// Selfie segmentation model (person vs. background). ~244 KB.
const SEG_MODEL = "/mediapipe/selfie_segmenter.tflite";

// Compositing resolution (the canvas' internal pixel buffer). Higher = sharper
// when the preview is shown/recorded large. The person is drawn from the
// full-res webcam here, so this keeps you crisp; CSS just scales the result.
const CW = 480;
const CH = 360;

// How strong the background blur is (CSS canvas filter, in px).
const BLUR_PX = 12;

// The selfie model's confidence mask is the probability a pixel is the PERSON
// (foreground). If your build ever comes out inverted (you get blurred and the
// room stays sharp), flip this to true.
const INVERT = false;

/**
 * Blurs the real webcam background on a preview <canvas>: the person is
 * segmented out and kept sharp, while everything behind them is blurred. The
 * <video> stays the source (shared with the head tracker) and is left untouched
 * — this only reads from it. Best-effort: if segmentation can't start, it throws
 * and the caller can just keep showing the raw video.
 *
 * @param {object} opts
 * @param {HTMLVideoElement}  opts.video     the webcam <video> (already playing)
 * @param {HTMLCanvasElement} opts.canvas    where the composited preview is drawn
 * @param {number}            [opts.blur]    initial blur strength in px
 * @param {"blur"|"image"}    [opts.mode]    background style ("blur" = blurred room)
 * @param {string|null}       [opts.imageUrl] image to use behind you in "image" mode
 * @returns {Promise<{stop:()=>void, setBlur:(px:number)=>void, setMode:(m:string)=>void, setImage:(url:string|null)=>void}>}
 */
export async function startWebcamBackground({
  video,
  canvas,
  blur = BLUR_PX,
  mode = "blur",
  imageUrl = null,
}) {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  let segmenter = null;
  for (const delegate of ["GPU", "CPU"]) {
    try {
      segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      break;
    } catch (err) {
      console.warn(`ImageSegmenter/${delegate} falhou:`, err?.message || err);
    }
  }
  if (!segmenter) throw new Error("Não foi possível iniciar a segmentação.");

  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Holds the mask's alpha at the model's native resolution (small). We upscale
  // it smoothly onto the work canvas to get a soft, high-res person edge.
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  let maskImage = null; // reused ImageData, rebuilt if the mask size changes

  // Person cutout at full compositing resolution.
  const work = document.createElement("canvas");
  work.width = CW;
  work.height = CH;
  const workCtx = work.getContext("2d");
  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = "high";

  let stopped = false;
  let raf = 0;
  let lastTs = -1;

  // Live, mutable config read fresh every frame so the UI can tune it in
  // real time (blur slider / background mode) without restarting the segmenter.
  let blurPx = Math.max(0, blur | 0);
  let curMode = mode === "image" ? "image" : "blur";
  let bgImg = null;
  const loadImage = (url) => {
    if (!url) {
      bgImg = null;
      return;
    }
    const im = new Image();
    im.onload = () => {
      bgImg = im;
    };
    im.onerror = () => {
      bgImg = null;
    };
    im.src = url;
  };
  if (imageUrl) loadImage(imageUrl);

  // Draw an image to cover CW×CH (like CSS background-size: cover), centered.
  const drawCover = (context, img) => {
    const r = Math.max(CW / img.width, CH / img.height);
    const w = img.width * r;
    const h = img.height * r;
    context.drawImage(img, (CW - w) / 2, (CH - h) / 2, w, h);
  };

  const frame = () => {
    if (stopped) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      // segmentForVideo needs strictly increasing timestamps.
      let ts = performance.now();
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;

      try {
        const res = segmenter.segmentForVideo(video, ts);
        const mask = res.confidenceMasks && res.confidenceMasks[0];
        if (mask) {
          const mw = mask.width;
          const mh = mask.height;
          const m = mask.getAsFloat32Array();

          // Paint the mask into a small canvas as pure alpha (white where the
          // person is). Kept at native res, then upscaled smoothly below.
          if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
            maskCanvas.width = mw;
            maskCanvas.height = mh;
            maskImage = maskCtx.createImageData(mw, mh);
          }
          const md = maskImage.data;
          for (let i = 0; i < m.length; i++) {
            const a = INVERT ? 1 - m[i] : m[i];
            const j = i * 4;
            md[j] = 255;
            md[j + 1] = 255;
            md[j + 2] = 255;
            md[j + 3] = a * 255;
          }
          maskCtx.putImageData(maskImage, 0, 0);

          // Person cutout, sharp: lay the smoothly-upscaled mask, then keep only
          // the full-res webcam pixels under it (source-in).
          workCtx.globalCompositeOperation = "source-over";
          workCtx.clearRect(0, 0, CW, CH);
          workCtx.drawImage(maskCanvas, 0, 0, CW, CH);
          workCtx.globalCompositeOperation = "source-in";
          workCtx.drawImage(video, 0, 0, CW, CH);
          workCtx.globalCompositeOperation = "source-over";

          // Draw the chosen background, then the sharp person on top.
          ctx.clearRect(0, 0, CW, CH);
          if (curMode === "image" && bgImg) {
            drawCover(ctx, bgImg);
          } else {
            // Blurred background = the frame itself, blurred and drawn a touch
            // larger so the blur leaves no dark halo at the edges. blurPx===0
            // simply shows the real room, unblurred.
            const pad = blurPx * 2;
            if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
            ctx.drawImage(video, -pad, -pad, CW + pad * 2, CH + pad * 2);
            ctx.filter = "none";
          }
          ctx.drawImage(work, 0, 0, CW, CH);
        }
        // Free the GPU/CPU mask buffers for this frame.
        res.close?.();
      } catch {
        // Transient per-frame errors (e.g. a repeated timestamp) — skip it.
      }
    }

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        segmenter.close();
      } catch {}
    },
    setBlur(px) {
      blurPx = Math.max(0, Number(px) || 0);
    },
    setMode(m) {
      curMode = m === "image" ? "image" : "blur";
    },
    setImage(url) {
      loadImage(url);
    },
  };
}
