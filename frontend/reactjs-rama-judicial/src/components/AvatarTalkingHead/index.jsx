import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { startHeadTracking } from "./headTracking";

const loadModules = async () => {
  const { TalkingHead } = await import("./talkinghead/modules/talkinghead.mjs");
  return { TalkingHead };
};

// Avatar model resolution (in order of priority):
// 1. VITE_AVATAR_URL  -> full URL to a .glb (local "/models/x.glb" or remote)
// 2. VITE_AVATAR_ID   -> a Ready Player Me avatar id; the RPM url is built with
//    the morph targets TalkingHead needs for lip-sync.
// 3. fallback         -> the model bundled in /public/models.
// To change the avatar's clothes/appearance: create an avatar at readyplayer.me,
// then set VITE_AVATAR_ID (its id) in .env.local. Also set VITE_AVATAR_BODY "F"/"M".
const RPM_PARAMS = "morphTargets=ARKit,Oculus Visemes&textureAtlas=1024&lod=0";
const AVATAR_BODY = import.meta.env.VITE_AVATAR_BODY || "F";
const AVATAR_URL =
  import.meta.env.VITE_AVATAR_URL ||
  (import.meta.env.VITE_AVATAR_ID
    ? `https://models.readyplayer.me/${import.meta.env.VITE_AVATAR_ID}.glb?${RPM_PARAMS}`
    : "/models/6806bf365a7750626bb8c233.glb");

export const AvatarTalkingHead = ({ message, playAudio }) => {
  const avatarRef = useRef(null);
  const videoRef = useRef(null);
  const trackerRef = useRef(null);
  const headRef = useRef(null);
  const [headInstance, setHeadInstance] = useState(null);
  const [camOn, setCamOn] = useState(false);
  const [camStatus, setCamStatus] = useState("");
  const [camLoading, setCamLoading] = useState(false);
  const [camSynced, setCamSynced] = useState(false);
  const [camDebug, setCamDebug] = useState(null);

  const toggleCamera = async () => {
    if (camLoading) return; // ignore clicks while starting
    if (camOn) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setCamOn(false);
      setCamStatus("");
      setCamSynced(false);
      setCamDebug(null);
      return;
    }
    if (!headInstance) {
      setCamStatus("Aguarde o avatar carregar...");
      return;
    }
    try {
      setCamOn(true);
      setCamLoading(true);
      setCamSynced(false);
      setCamStatus("Carregando rastreamento...");
      trackerRef.current = await startHeadTracking({
        head: headInstance,
        video: videoRef.current,
        onStatus: setCamStatus,
        onSynced: () => {
          setCamLoading(false);
          setCamSynced(true);
        },
        onDebug: setCamDebug,
      });
    } catch (err) {
      console.error("Head tracking failed:", err);
      setCamStatus("Erro ao acessar a câmera: " + (err?.message || err));
      setCamOn(false);
      setCamLoading(false);
    }
  };

  const renderAvatar = async (isCancelled) => {
    try {
      const { TalkingHead } = await loadModules();
      if (isCancelled()) return;

      // Start from a clean container so a leftover canvas can never stack.
      if (avatarRef.current) avatarRef.current.innerHTML = "";

      const head = new TalkingHead(avatarRef.current, {
        ttsEndpoint: import.meta.env.VITE_TTS_ENDPOINT,
        ttsApikey: import.meta.env.VITE_TTS_API_KEY,
        lipsyncModules: ["es"],
        cameraView: "upper",
      });
      headRef.current = head;

      await head.showAvatar(
        {
          url: AVATAR_URL,
          body: AVATAR_BODY,
          avatarMood: "neutral",
          ttsLang: "es-ES",
          ttsVoice: "es-ES-Standard-F",
          lipsyncLang: "es",
          ttsRate: 0.85,
        },
        (ev) => {
          if (ev.lengthComputable) {
            const val = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
          }
        }
      );
      if (isCancelled()) {
        try {
          head.stop();
        } catch {}
        return;
      }
      head.start();
      head.playGesture("handup");
      setHeadInstance(head);
    } catch (error) {
      console.error("Failed to render avatar:", error);
    }
  };

  useEffect(() => {
    // React StrictMode double-mounts in dev; without this the first mount
    // would create an avatar instance the second one abandons, leaving two
    // stacked canvases -> the tracker drives one while you see the other
    // ("sometimes it follows, sometimes it doesn't"). The cancel flag makes
    // the first (throwaway) mount bail before it creates a second instance.
    let cancelled = false;
    renderAvatar(() => cancelled);
    return () => {
      cancelled = true;
      trackerRef.current?.stop();
      trackerRef.current = null;
      try {
        headRef.current?.stop();
      } catch {}
      if (avatarRef.current) avatarRef.current.innerHTML = "";
      headRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (headInstance && message && playAudio) {
      headInstance.speakText(message);
    }
  }, [message, headInstance]);

  useEffect(() => {
    if (headInstance && !playAudio) {
      headInstance.stopSpeaking();
    }
  }, [playAudio]);

  return (
    <div style={styles.wrapper}>
      <div
        ref={avatarRef}
        style={styles.avatar}
      />

      {/* Webcam preview used by the face tracker (mirrored, small corner) */}
      <video
        ref={videoRef}
        style={{ ...styles.video, display: camOn ? "block" : "none" }}
        muted
        playsInline
      />

      <div style={styles.camPanel}>
        <div
          style={{ ...styles.camRow, cursor: camLoading ? "wait" : "pointer" }}
          onClick={toggleCamera}
        >
          <span
            style={{
              ...styles.switch,
              background: camOn ? "#248a52" : "rgba(255,255,255,0.25)",
            }}
          >
            <span
              style={{
                ...styles.switchKnob,
                transform: camOn ? "translateX(20px)" : "translateX(0px)",
              }}
            />
          </span>
          <span style={styles.camLabel}>🎥 Copiar meus movimentos</span>
          {camLoading && <span style={styles.spinner} />}
          {camSynced && !camLoading && <span style={styles.dotOk} />}
        </div>
        <span style={styles.camHint}>
          {camStatus || (camOn ? "" : "Desativado — avatar no modo natural")}
        </span>
        {camOn && camDebug && (
          <span style={styles.camDebug}>
            frames {camDebug.frames} · rosto {camDebug.hasFace ? "sim" : "não"} ·
            corpo {camDebug.armsOk ? (camDebug.hasPose ? "sim" : "não") : "off"} ·
            mãos {camDebug.hasHands ? "sim" : "não"} ·
            matriz {camDebug.matrix ? "ok" : camDebug.landmarks ? "fallback" : "—"}
          </span>
        )}
      </div>

      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
};

const styles = {
  wrapper: {
    width: "100dvw",
    height: "100dvh",
    margin: "auto",
    position: "relative",
    backgroundImage: "url('assets/bg.jpeg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "white",
    fontFamily: "Arial",
  },
  avatar: {
    display: "block",
    width: "100%",
    height: "100%",
  },
  video: {
    position: "absolute",
    bottom: 20,
    left: 20,
    width: 160,
    height: 120,
    objectFit: "cover",
    borderRadius: 10,
    border: "2px solid rgba(255,255,255,0.6)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    transform: "scaleX(-1)", // mirror so it feels like a mirror
    zIndex: 1001,
    pointerEvents: "none",
  },
  camPanel: {
    position: "absolute",
    top: 70,
    left: 20,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "12px 14px",
    background: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    backdropFilter: "blur(4px)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
    zIndex: 1001,
  },
  camRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    userSelect: "none",
  },
  switch: {
    position: "relative",
    display: "inline-block",
    width: 44,
    height: 24,
    borderRadius: 999,
    transition: "background 0.2s ease",
    flexShrink: 0,
  },
  switchKnob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "white",
    transition: "transform 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  camLabel: {
    fontSize: 14,
    fontWeight: 600,
  },
  camHint: {
    fontSize: 12,
    opacity: 0.85,
    minHeight: 15,
  },
  camDebug: {
    fontSize: 11,
    opacity: 0.6,
    fontFamily: "monospace",
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.35)",
    borderTopColor: "#fff",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
  },
  dotOk: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#37d67a",
    boxShadow: "0 0 6px #37d67a",
    flexShrink: 0,
  },
};
