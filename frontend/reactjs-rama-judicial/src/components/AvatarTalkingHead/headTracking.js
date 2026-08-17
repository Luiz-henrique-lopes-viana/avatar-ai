import {
  FaceLandmarker,
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";

// Self-hosted MediaPipe assets (see public/mediapipe). Using local files avoids
// depending on a CDN that could be blocked on the user's network.
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";
const POSE_MODEL = "/mediapipe/pose_landmarker_lite.task";
const HAND_MODEL = "/mediapipe/hand_landmarker.task";

// Head-rotation limits (radians) so the avatar never snaps to extreme angles.
const LIMIT = { pitch: 0.55, yaw: 0.8, roll: 0.45 };
// How fast the avatar head follows the webcam (0..1). Lower = smoother/laggier.
const SMOOTHING = 0.5;
// Amplify the detected rotation a little so small head turns read clearly.
const GAIN = 1.3;

// ----- Mouth tuning -----
// How fast the mouth follows (0..1). Higher = snappier.
const MOUTH_SMOOTHING = 0.45;
// Amplify the detected opening a bit (jawOpen rarely reaches 1.0).
const MOUTH_GAIN = 1.4;

// ----- Blink tuning -----
// Blinks are fast, so smooth lightly (higher = snappier) and amplify a little
// so a real blink fully closes the avatar's eyes.
const BLINK_SMOOTHING = 0.6;
const BLINK_GAIN = 1.8;

// ----- Finger tuning -----
// How fast fingers follow (0..1).
const FINGER_SMOOTHING = 0.5;
// Max bend (radians) applied per phalanx at full curl, around the bone's local
// X axis (the rig curls fingers on +X). A real fist in this rig reaches x~1.4
// on phalanx 1, x~1.6 on phalanx 2 (from TalkingHead's own fist gesture), so
// these need to be large or the hand only half-closes.
const FINGER_MAX = { 1: 1.2, 2: 1.6, 3: 0.5 };
// Scales the raw curl estimate; >1 makes a light bend read as a stronger curl.
const FINGER_GAIN = 1.4;
// Map MediaPipe handedness label -> avatar hand. Flip if hands come swapped.
const HAND_SWAP = false;

// ----- Thumb tuning -----
// The thumb doesn't curl on a single axis like the fingers; it folds across the
// palm. Instead of rotX we slerp the thumb bones from their rest pose toward the
// rig's own folded-thumb rotation (from TalkingHead's fist gesture, left hand;
// the right hand is the mirror). Amount is driven by how adducted the thumb is.
const THUMB_CLOSED_EULER_L = {
  1: new THREE.Euler(0.579, 0.228, 0.363, "XYZ"),
  2: new THREE.Euler(-0.027, -0.04, -0.662, "XYZ"),
  3: new THREE.Euler(0.0, 0.0, 0.0, "XYZ"),
};
// Thumb-tip -> pinky-knuckle distance (normalized by hand size) that maps to
// fully open vs fully folded. Tune to your camera/hand if the thumb over/under-
// reacts: raise CLOSED to fold sooner, lower OPEN to keep it out longer.
const THUMB_OPEN_D = 1.1;
const THUMB_CLOSED_D = 0.55;

// Rig mirrors a left-hand pose to the right by negating the quaternion's x & w.
function thumbClosedQuat(side, j) {
  const q = new THREE.Quaternion().setFromEuler(THUMB_CLOSED_EULER_L[j]);
  if (side === "Right") {
    q.x *= -1;
    q.w *= -1;
  }
  return q;
}

// ----- Arm tuning -----
// How fast the arms follow (0..1). Lower = smoother/laggier.
const ARM_SMOOTHING = 0.35;
// Wrist follows a bit slower than the arm to hide hand-detection jitter.
const WRIST_SMOOTHING = 0.25;
// Ignore hand detections below this handedness confidence. At frame edges (hand
// lowered/cut off) MediaPipe briefly mislabels or loses the hand; skipping those
// stops the wrist from jumping.
const HAND_MIN_CONF = 0.6;
// Frames a hand may go unseen before the wrist relaxes straight along the
// forearm. Bridges 1-2 frame dropouts without freezing a bent pose.
const WRIST_RELAX_AFTER = 4;
// Axis remap from MediaPipe world space -> avatar world space.
// MediaPipe world: +x image-right, +y down, +z toward camera.
// If an arm moves the wrong way on one axis, flip that sign.
const AXIS = { x: 1, y: -1, z: 1 };
// MIRROR=false: same side (raise your right arm -> the avatar raises ITS right).
// MIRROR=true:  mirror image (raise your right arm -> the arm facing you moves).
const MIRROR = false;
// MediaPipe Pose landmark indices.
const LM = { L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14, L_WR: 15, R_WR: 16 };

// Create a landmarker trying GPU first, then CPU, then giving up (null).
async function makeLandmarker(Klass, vision, model, extra) {
  for (const delegate of ["GPU", "CPU"]) {
    try {
      return await Klass.createFromOptions(vision, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: "VIDEO",
        ...extra,
      });
    } catch (err) {
      console.warn(`${Klass.name}/${delegate} falhou:`, err?.message || err);
    }
  }
  return null;
}

/**
 * Starts webcam head-tracking and drives the TalkingHead avatar's Head bone.
 * Returns a controller with stop().
 *
 * @param {object}   opts
 * @param {object}   opts.head      the TalkingHead instance (must be started)
 * @param {HTMLVideoElement} opts.video  a <video> element to receive the webcam
 * @param {(s:string)=>void} [opts.onStatus] status/error callback for the UI
 */
export async function startHeadTracking({ head, video, onStatus, onSynced, onDebug }) {
  let lastMsg = "";
  const say = (s) => {
    if (onStatus && s !== lastMsg) {
      lastMsg = s;
      onStatus(s);
    }
  };
  let syncedFired = false;
  const markSynced = () => {
    if (!syncedFired) {
      syncedFired = true;
      onSynced?.();
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
    outputFaceBlendshapes: true, // gives jawOpen etc. for mouth mimicry
  });

  // Body/arm model is OPTIONAL: if it fails, the head keeps working.
  const poseLandmarker = await makeLandmarker(PoseLandmarker, vision, POSE_MODEL, {
    numPoses: 1,
  });

  // Hand/finger model is OPTIONAL too.
  const handLandmarker = await makeLandmarker(HandLandmarker, vision, HAND_MODEL, {
    numHands: 2,
  });

  say("Pedindo acesso à câmera...");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  // ---- Resolve arm bone chains (avatar side <- user side; mirrored) ----
  const armature = head.armature;
  const bone = (n) => armature?.getObjectByName(n);
  const sides = [
    {
      up: bone(MIRROR ? "RightArm" : "LeftArm"),
      fore: bone(MIRROR ? "RightForeArm" : "LeftForeArm"),
      hand: bone(MIRROR ? "RightHand" : "LeftHand"),
      sh: LM.L_SH, el: LM.L_EL, wr: LM.L_WR,
    },
    {
      up: bone(MIRROR ? "LeftArm" : "RightArm"),
      fore: bone(MIRROR ? "LeftForeArm" : "RightForeArm"),
      hand: bone(MIRROR ? "LeftHand" : "RightHand"),
      sh: LM.R_SH, el: LM.R_EL, wr: LM.R_WR,
    },
  ];
  const armsOk =
    !!poseLandmarker && !!armature && sides.every((s) => s.up && s.fore && s.hand);
  for (const s of sides) {
    if (!s.up) continue;
    s.curUp = new THREE.Quaternion();
    s.curFore = new THREE.Quaternion();
    s.curHand = new THREE.Quaternion();
    s.upDir = s.fore.position.clone().normalize(); // rest dir shoulder->elbow
    s.foreDir = s.hand.position.clone().normalize(); // rest dir elbow->wrist
    // Rest dir wrist->middle-finger base, used to orient the hand (wrist) bone.
    const midBone = bone(`${s.hand.name}Middle1`);
    s.handDir = midBone ? midBone.position.clone().normalize() : null;
    s.targetUp = null;
    s.targetFore = null;
    s.targetHand = null;
    s.handSeen = false;
    s.handMiss = 0;
  }
  // Look up the arm side that owns each hand bone, so the hand model (which
  // reports handedness as "Left"/"Right") can feed the matching wrist target.
  const sideByHandName = {};
  for (const s of sides) if (s.hand) sideByHandName[s.hand.name] = s;

  // ---- Resolve mouth morph targets (jawOpen / mouthOpen) ----
  // We write these influences directly each frame, blended with whatever the
  // lip-sync set (max wins), so opening your mouth works whether or not the
  // avatar is speaking.
  const mouthMorphs = [];
  for (const m of head.morphs || []) {
    for (const key of ["jawOpen", "mouthOpen"]) {
      const idx = m.morphTargetDictionary?.[key];
      if (idx !== undefined) {
        mouthMorphs.push({ infl: m.morphTargetInfluences, idx, key });
      }
    }
  }
  const mouthOk = mouthMorphs.length > 0;
  let mouthTarget = 0; // latest detected opening (0..1)
  let mouthCur = 0; // smoothed value actually applied

  // ---- Resolve eye-blink morph targets ----
  const eyeMorphs = { eyeBlinkLeft: [], eyeBlinkRight: [] };
  for (const m of head.morphs || []) {
    for (const key of ["eyeBlinkLeft", "eyeBlinkRight"]) {
      const idx = m.morphTargetDictionary?.[key];
      if (idx !== undefined) {
        eyeMorphs[key].push({ infl: m.morphTargetInfluences, idx });
      }
    }
  }
  const blinkOk = eyeMorphs.eyeBlinkLeft.length + eyeMorphs.eyeBlinkRight.length > 0;
  let blinkTargetL = 0;
  let blinkTargetR = 0;
  let blinkCurL = 0;
  let blinkCurR = 0;

  // ---- Resolve finger bones per hand ----
  // Each hand has 5 fingers; we curl phalanges 1..3 around their local X axis
  // (phalanx 4 is the fingertip, no child to animate). We snapshot each bone's
  // REST rotation and, per frame, set rotation = rest * rotX(curl * max).
  const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
  const hands = {
    Left: { bones: [], curl: {}, target: {} },
    Right: { bones: [], curl: {}, target: {} },
  };
  for (const side of ["Left", "Right"]) {
    for (const finger of FINGERS) {
      hands[side].curl[finger] = 0;
      hands[side].target[finger] = 0;
      for (const j of [1, 2, 3]) {
        const b = bone(`${side}Hand${finger}${j}`);
        if (b) {
          hands[side].bones.push({
            bone: b,
            rest: b.quaternion.clone(),
            finger,
            max: FINGER_MAX[j],
            // Thumb bones fold toward a pose instead of rotating around X.
            closed: finger === "Thumb" ? thumbClosedQuat(side, j) : null,
          });
        }
      }
    }
  }
  const fingersOk =
    !!handLandmarker && hands.Left.bones.length + hands.Right.bones.length > 0;
  let hasHands = false;

  // Reusable math objects (avoid per-frame allocations).
  const mtx4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const targetQuat = new THREE.Quaternion(); // where we want the head to point
  const _pW = new THREE.Quaternion();
  const _pInv = new THREE.Quaternion();
  const _r = new THREE.Quaternion();
  const _upW = new THREE.Quaternion();
  const _fq = new THREE.Quaternion();
  const _xAxis = new THREE.Vector3(1, 0, 0);

  let running = true;
  let lastVideoTime = -1;
  let hasFace = false;
  let hasPose = false;
  let matrixWarned = false;
  let framesProcessed = 0;
  let patchErrored = false;

  // Mutable copy so the axis signs can be flipped live (keys X/Y/Z) while the
  // user watches, to find the mapping that matches their webcam/lighting.
  const axis = { ...AXIS };
  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === "x") axis.x *= -1;
    else if (k === "y") axis.y *= -1;
    else if (k === "z") axis.z *= -1;
    else return;
    const combo = `AXIS x:${axis.x} y:${axis.y} z:${axis.z}`;
    console.log("[braços] " + combo);
    say("Ajuste braços → " + combo);
  };
  window.addEventListener("keydown", onKey);

  // Direction from landmark a -> b, remapped into avatar world axes.
  const mpDir = (a, b) =>
    new THREE.Vector3(
      (b.x - a.x) * axis.x,
      (b.y - a.y) * axis.y,
      (b.z - a.z) * axis.z
    ).normalize();

  const _dir = new THREE.Vector3();
  const _perp = new THREE.Vector3();

  // Rotate a bone so its rest direction points along world `targetDir`.
  //
  // We use the SHORTEST-ARC rotation (setFromUnitVectors): the minimal rotation
  // from the bone's rest direction to the target. It adds no artificial twist,
  // so the shoulder/deltoid keeps its natural shape.
  //
  // The one failure mode is when target is ~180° from rest (arm raised straight
  // up, opposite the rest-down direction): the rotation axis is undefined and
  // Three.js would pick an arbitrary perpendicular, which flickers/twists frame
  // to frame ("bugado"). We handle that case explicitly with a STABLE, chosen
  // perpendicular so the flip is deterministic and smooth.
  // Returns the bone's resulting world quaternion (parentWorld * newLocal).
  function driveBone(b, restDir, targetDir, cur, smoothing = ARM_SMOOTHING) {
    b.parent.getWorldQuaternion(_pW);
    _pInv.copy(_pW).invert();
    _dir.copy(targetDir).applyQuaternion(_pInv); // target in parent-local space
    if (_dir.lengthSq() < 1e-6) return _upW.copy(_pW).multiply(b.quaternion);
    _dir.normalize();

    const d = THREE.MathUtils.clamp(restDir.dot(_dir), -1, 1);
    if (d < -0.9999) {
      // ~180°: choose a deterministic axis perpendicular to restDir.
      _perp.set(1, 0, 0);
      if (Math.abs(restDir.x) > 0.9) _perp.set(0, 0, 1);
      _perp.cross(restDir).normalize();
      _r.setFromAxisAngle(_perp, Math.PI);
    } else {
      _r.setFromUnitVectors(restDir, _dir);
    }
    cur.slerp(_r, smoothing);
    b.quaternion.copy(cur);
    return _upW.copy(_pW).multiply(cur);
  }

  function applyArms() {
    armature.updateWorldMatrix(true, true);
    for (const s of sides) {
      if (!s.targetUp) continue;
      driveBone(s.up, s.upDir, s.targetUp, s.curUp);
      // Forearm depends on the upper arm's new pose -> refresh world matrices
      // for this side's chain before driving it.
      s.up.updateWorldMatrix(true, true);
      driveBone(s.fore, s.foreDir, s.targetFore, s.curFore);
      // Wrist: orient the hand bone toward where the user's hand points. Needs
      // the forearm's new pose first, and a target from the hand model.
      if (s.targetHand && s.handDir) {
        s.fore.updateWorldMatrix(true, true);
        driveBone(s.hand, s.handDir, s.targetHand, s.curHand, WRIST_SMOOTHING);
      }
    }
  }

  // Estimate how curled a finger is (0=straight, 1=fully closed) from its four
  // hand landmarks a->b->c->d. We measure how much the finger bends at each
  // joint: aligned segments (dot ~1) mean straight, folded segments mean curled.
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  function fingerCurl(a, b, c, d) {
    _v1.set(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)).normalize();
    _v2.set(c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)).normalize();
    _v3.set(d.x - c.x, d.y - c.y, (d.z || 0) - (c.z || 0)).normalize();
    const straight = (_v1.dot(_v2) + _v2.dot(_v3)) / 2; // ~1 straight, lower curled
    return THREE.MathUtils.clamp((1 - straight) * FINGER_GAIN, 0, 1);
  }

  // Thumb "closed" amount (0=out, 1=folded across palm). The thumb barely bends
  // along its own length when it closes; instead its tip moves toward the palm.
  // We measure the thumb-tip -> pinky-knuckle distance, normalized by hand size
  // so it's independent of how far the hand is from the camera.
  const _d3 = (a, b) =>
    Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  function thumbClose(lm) {
    const handSize = _d3(lm[0], lm[9]) || 1; // wrist -> middle knuckle
    const d = _d3(lm[4], lm[17]) / handSize; // thumb tip -> pinky knuckle
    return THREE.MathUtils.clamp(
      (THUMB_OPEN_D - d) / (THUMB_OPEN_D - THUMB_CLOSED_D),
      0,
      1
    );
  }

  function applyFingers() {
    for (const side of ["Left", "Right"]) {
      const h = hands[side];
      for (const finger of FINGERS) {
        h.curl[finger] +=
          (h.target[finger] - h.curl[finger]) * FINGER_SMOOTHING;
      }
      for (const fb of h.bones) {
        if (fb.closed) {
          // Thumb: interpolate rest -> folded pose by how closed the thumb is.
          fb.bone.quaternion.copy(fb.rest).slerp(fb.closed, h.curl.Thumb);
        } else {
          _fq.setFromAxisAngle(_xAxis, h.curl[fb.finger] * fb.max);
          fb.bone.quaternion.copy(fb.rest).multiply(_fq);
        }
      }
    }
  }

  // Override the avatar head at the very end of each frame. TalkingHead calls
  // this.render() as the last step of its animate() loop, so patching render()
  // guarantees our rotation wins over the idle/eye-contact pose animation.
  const originalRender = head.render.bind(head);
  head.render = function patchedRender() {
    try {
      if (running && hasFace && head.objectHead) {
        head.objectHead.quaternion.slerp(targetQuat, SMOOTHING);
      }
      if (running && hasPose && armsOk) {
        applyArms();
      }
      if (running && fingersOk) {
        // Always run while tracking: when a hand isn't seen its curl target is
        // 0, so fingers smoothly relax open instead of freezing.
        applyFingers();
      }
      // Drive the mouth from the webcam ONLY while the avatar isn't speaking
      // (TTS lip-sync owns the mouth then). We WRITE the value every frame,
      // including down to 0, so the mouth closes as you close yours.
      if (running && hasFace && mouthOk && !head.isSpeaking) {
        mouthCur += (mouthTarget - mouthCur) * MOUTH_SMOOTHING;
        for (const fm of mouthMorphs) {
          fm.infl[fm.idx] = fm.key === "jawOpen" ? mouthCur : mouthCur * 0.6;
        }
      }
      // Blink together with the user. Written every frame (including back to 0)
      // so the eyes reopen; this overrides the avatar's idle auto-blink.
      if (running && hasFace && blinkOk) {
        blinkCurL += (blinkTargetL - blinkCurL) * BLINK_SMOOTHING;
        blinkCurR += (blinkTargetR - blinkCurR) * BLINK_SMOOTHING;
        for (const e of eyeMorphs.eyeBlinkLeft) e.infl[e.idx] = blinkCurL;
        for (const e of eyeMorphs.eyeBlinkRight) e.infl[e.idx] = blinkCurR;
      }
    } catch (err) {
      // Never let a tracking error freeze the avatar's rendering.
      if (!patchErrored) {
        patchErrored = true;
        console.error("Erro ao aplicar rastreamento (ignorando):", err);
      }
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
      framesProcessed++;
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

      // Mouth opening from blendshapes (independent of the head-pose matrix).
      const blends = result?.faceBlendshapes?.[0]?.categories;
      if (blends) {
        const jaw = blends.find((c) => c.categoryName === "jawOpen");
        mouthTarget = jaw
          ? THREE.MathUtils.clamp(jaw.score * MOUTH_GAIN, 0, 1)
          : 0;
        const bl = blends.find((c) => c.categoryName === "eyeBlinkLeft");
        const br = blends.find((c) => c.categoryName === "eyeBlinkRight");
        blinkTargetL = bl ? THREE.MathUtils.clamp(bl.score * BLINK_GAIN, 0, 1) : 0;
        blinkTargetR = br ? THREE.MathUtils.clamp(br.score * BLINK_GAIN, 0, 1) : 0;
      }

      if (matrix) {
        hasFace = true;
        markSynced();
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
        if (hasFace) markSynced();
        say(hasFace ? "Seguindo você 🙂" : "Procurando seu rosto...");
      } else {
        hasFace = false;
        say("Procurando seu rosto... (centralize e melhore a luz)");
      }

      // ---- Body / arms (every other frame to stay light) ----
      if (armsOk && framesProcessed % 2 === 0) {
        let pr = null;
        try {
          pr = poseLandmarker.detectForVideo(video, performance.now());
        } catch (err) {
          console.error("pose detectForVideo falhou:", err);
        }
        const wl = pr?.worldLandmarks?.[0];
        if (wl && wl[LM.L_SH] && wl[LM.R_SH]) {
          hasPose = true;
          markSynced();
          for (const s of sides) {
            s.targetUp = mpDir(wl[s.sh], wl[s.el]);
            s.targetFore = mpDir(wl[s.el], wl[s.wr]);
          }
        } else {
          hasPose = false;
        }
      }

      // ---- Hands / fingers (odd frames to interleave with the pose model) ----
      if (fingersOk && framesProcessed % 2 === 1) {
        let hr = null;
        try {
          hr = handLandmarker.detectForVideo(video, performance.now());
        } catch (err) {
          console.error("hand detectForVideo falhou:", err);
        }
        const handsLm = hr?.landmarks;
        const handed = hr?.handednesses;
        hands.Left.seen = false;
        hands.Right.seen = false;
        for (const s of sides) s.handSeen = false;
        if (handsLm && handsLm.length) {
          hasHands = true;
          markSynced();
          for (let i = 0; i < handsLm.length; i++) {
            const lm = handsLm[i];
            const hcat = handed?.[i]?.[0];
            let label = hcat?.categoryName || "Right";
            // Low-confidence detections (hand at frame edge / half out) flip
            // labels and jump; skip them so fingers + wrist relax instead.
            if ((hcat?.score ?? 1) < HAND_MIN_CONF) continue;
            if (HAND_SWAP) label = label === "Left" ? "Right" : "Left";
            const h = hands[label];
            if (!h) continue;
            h.seen = true;
            h.target.Thumb = thumbClose(lm);
            h.target.Index = fingerCurl(lm[5], lm[6], lm[7], lm[8]);
            h.target.Middle = fingerCurl(lm[9], lm[10], lm[11], lm[12]);
            h.target.Ring = fingerCurl(lm[13], lm[14], lm[15], lm[16]);
            h.target.Pinky = fingerCurl(lm[17], lm[18], lm[19], lm[20]);

            // Wrist orientation: point the hand bone the way the real hand
            // points (wrist landmark 0 -> middle-finger MCP landmark 9), using
            // the metric worldLandmarks so it shares the pose model's axes.
            const sw = sideByHandName[label + "Hand"];
            if (sw && sw.handDir) {
              const whl = hr.worldLandmarks?.[i];
              if (whl && whl[0] && whl[9]) {
                sw.targetHand = mpDir(whl[0], whl[9]);
                sw.handSeen = true;
              }
            }
          }
        } else {
          hasHands = false;
        }
        // Any hand not seen this frame relaxes back to open (curl target 0).
        for (const side of ["Left", "Right"]) {
          if (!hands[side].seen) {
            for (const f of FINGERS) hands[side].target[f] = 0;
          }
        }
        // Wrist: hold through brief dropouts, then straighten along the forearm
        // once the hand has been gone for a few frames (avoids a frozen bent
        // pose / jitter when you lower your arm out of the camera's view).
        for (const s of sides) {
          if (s.handSeen) {
            s.handMiss = 0;
          } else {
            s.handMiss++;
            if (s.handMiss > WRIST_RELAX_AFTER && s.handDir) {
              s.targetHand = s.targetFore;
            }
          }
        }
      }

      // Live diagnostics so we can see, on the user's real webcam, exactly
      // where tracking stalls (frames flowing? face found? matrix vs fallback?).
      if (onDebug && framesProcessed % 15 === 0) {
        onDebug({
          frames: framesProcessed,
          hasFace,
          hasPose,
          hasHands,
          armsOk,
          matrix: !!matrix,
          landmarks: !!landmarks,
          readyState: video.readyState,
        });
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  say("Procurando seu rosto...");

  return {
    stop() {
      running = false;
      window.removeEventListener("keydown", onKey);
      head.render = originalRender; // restore original render
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        faceLandmarker.close();
      } catch {}
      try {
        poseLandmarker?.close();
      } catch {}
      try {
        handLandmarker?.close();
      } catch {}
      if (video) video.srcObject = null;
      say("");
    },
  };
}
