import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

// Self-hosted MediaPipe assets (see public/mediapipe), same as headTracking.js.
const WASM_PATH = "/mediapipe/wasm";
// Selfie segmentation model (person vs. background). ~244 KB.
const SEG_MODEL = "/mediapipe/selfie_segmenter.tflite";

// Compositing resolution. It's only a small corner preview, so keep it cheap;
// CSS scales the canvas down to the on-screen size. 4:3 to match the webcam.
const CW = 320;
const CH = 240;

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
 * @param {HTMLVideoElement}  opts.video   the webcam <video> (already playing)
 * @param {HTMLCanvasElement} opts.canvas  where the composited preview is drawn
 * @returns {Promise<{stop:()=>void}>}
 */
export async function startWebcamBackground({ video, canvas }) {
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

  // Offscreen canvas holds the person cutout at the mask's native resolution.
  const work = document.createElement("canvas");
  const workCtx = work.getContext("2d", { willReadFrequently: true });

  let stopped = false;
  let raf = 0;
  let lastTs = -1;

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
          if (work.width !== mw || work.height !== mh) {
            work.width = mw;
            work.height = mh;
          }
          // Draw the current frame at mask resolution, then punch the
          // background out via the mask's alpha -> person-only cutout.
          workCtx.drawImage(video, 0, 0, mw, mh);
          const imgData = workCtx.getImageData(0, 0, mw, mh);
          const px = imgData.data;
          const m = mask.getAsFloat32Array();
          for (let i = 0; i < m.length; i++) {
            const a = INVERT ? 1 - m[i] : m[i];
            px[i * 4 + 3] = a * 255;
          }
          workCtx.putImageData(imgData, 0, 0);

          // Blurred background = the frame itself, blurred. Draw it a touch
          // larger than the canvas so the blur doesn't leave a dark halo at
          // the edges. Then the sharp person cutout on top.
          const pad = BLUR_PX * 2;
          ctx.clearRect(0, 0, CW, CH);
          ctx.filter = `blur(${BLUR_PX}px)`;
          ctx.drawImage(video, -pad, -pad, CW + pad * 2, CH + pad * 2);
          ctx.filter = "none";
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
  };
}
