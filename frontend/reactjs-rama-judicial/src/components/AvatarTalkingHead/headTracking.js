import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from "three";

// Self-hosted MediaPipe assets (see public/mediapipe). Using local files avoids
// depending on a CDN that could be blocked on the user's network.
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

// Head-rotation limits (radians) so the avatar never snaps to extreme angles.
const LIMIT = { pitch: 0.55, yaw: 0.8, roll: 0.45 };
// How fast the avatar head follows the webcam (0..1). Lower = smoother/laggier.
const SMOOTHING = 0.5;
// Amplify the detected rotation a little so small head turns read clearly.
const GAIN = 1.3;

/**
 * Starts webcam head-tracking and drives the TalkingHead avatar's Head bone.
 * Returns a controller with stop().
 *
 * @param {object}   opts
 * @param {object}   opts.head      the TalkingHead instance (must be started)
 * @param {HTMLVideoElement} opts.video  a <video> element to receive the webcam
 * @param {(s:string)=>void} [opts.onStatus] status/error callback for the UI
 */
export async function startHeadTracking({ head, video, onStatus }) {
  let lastMsg = "";
  const say = (s) => {
    if (onStatus && s !== lastMsg) {
      lastMsg = s;
      onStatus(s);
    }
  };

  if (!head?.objectHead) {
    throw new Error("O avatar ainda não terminou de carregar.");
  }

  say("Carregando modelo de rastreamento...");
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });

  say("Pedindo acesso à câmera...");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  // Reusable math objects (avoid per-frame allocations).
  const mtx4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const targetQuat = new THREE.Quaternion(); // where we want the head to point

  let running = true;
  let lastVideoTime = -1;
  let hasFace = false;
  let matrixWarned = false;

  // Override the avatar head at the very end of each frame. TalkingHead calls
  // this.render() as the last step of its animate() loop, so patching render()
  // guarantees our rotation wins over the idle/eye-contact pose animation.
  const originalRender = head.render.bind(head);
  head.render = function patchedRender() {
    if (running && hasFace && head.objectHead) {
      head.objectHead.quaternion.slerp(targetQuat, SMOOTHING);
    }
    originalRender();
  };

  // Apply pitch/yaw/roll (radians) -> targetQuat, mirrored like a mirror image.
  function setTarget(pitch, yaw, roll) {
    pitch = THREE.MathUtils.clamp(pitch * GAIN, -LIMIT.pitch, LIMIT.pitch);
    yaw = THREE.MathUtils.clamp(-yaw * GAIN, -LIMIT.yaw, LIMIT.yaw);
    roll = THREE.MathUtils.clamp(-roll * GAIN, -LIMIT.roll, LIMIT.roll);
    euler.set(pitch, yaw, roll, "YXZ");
    targetQuat.setFromEuler(euler);
  }

  // Fallback head-pose estimation straight from the landmarks, used when the
  // facial transformation matrix isn't available for some reason.
  function poseFromLandmarks(lm) {
    // MediaPipe FaceMesh canonical indices.
    const nose = lm[1];
    const leftEye = lm[33]; // subject's right eye (image-left)
    const rightEye = lm[263];
    const chin = lm[152];
    const forehead = lm[10];
    if (!nose || !leftEye || !rightEye || !chin || !forehead) return false;

    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const faceH = Math.abs(chin.y - forehead.y) || 0.2;
    const faceW = Math.abs(rightEye.x - leftEye.x) || 0.2;

    // yaw: nose horizontal offset from the eye center, normalized by face width.
    const yaw = ((nose.x - eyeMidX) / faceW) * 1.6;
    // pitch: nose vertical offset from the eye center, normalized by face height.
    const pitch = ((nose.y - eyeMidY) / faceH - 0.35) * 1.8;
    // roll: tilt of the eye line.
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

    // These are already in "mirror" convention because getUserMedia isn't
    // mirrored; setTarget negates yaw/roll, so pass raw values.
    setTarget(pitch, yaw, roll);
    return true;
  }

  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      let result;
      try {
        result = faceLandmarker.detectForVideo(video, performance.now());
      } catch (err) {
        console.error("detectForVideo falhou:", err);
        say("Erro no rastreamento: " + (err?.message || err));
        result = null;
      }

      const matrix = result?.facialTransformationMatrixes?.[0]?.data;
      const landmarks = result?.faceLandmarks?.[0];

      if (matrix) {
        hasFace = true;
        say("Seguindo você 🙂");
        mtx4.fromArray(matrix);
        mtx4.decompose(pos, quat, scl);
        euler.setFromQuaternion(quat, "YXZ");
        setTarget(euler.x, euler.y, euler.z);
      } else if (landmarks) {
        // Matrices unavailable but we still have landmarks -> use fallback.
        if (!matrixWarned) {
          console.warn(
            "facialTransformationMatrixes vazio; usando fallback por landmarks."
          );
          matrixWarned = true;
        }
        hasFace = poseFromLandmarks(landmarks);
        say(hasFace ? "Seguindo você 🙂" : "Procurando seu rosto...");
      } else {
        hasFace = false;
        say("Procurando seu rosto... (centralize e melhore a luz)");
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  say("Procurando seu rosto...");

  return {
    stop() {
      running = false;
      head.render = originalRender; // restore original render
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        faceLandmarker.close();
      } catch {}
      if (video) video.srcObject = null;
      say("");
    },
  };
}
