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
  const [headInstance, setHeadInstance] = useState(null);
  const [camOn, setCamOn] = useState(false);
  const [camStatus, setCamStatus] = useState("");

  const toggleCamera = async () => {
    if (camOn) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setCamOn(false);
      setCamStatus("");
      return;
    }
    if (!headInstance) {
      setCamStatus("Aguarde o avatar carregar...");
      return;
    }
    try {
      setCamOn(true);
      trackerRef.current = await startHeadTracking({
        head: headInstance,
        video: videoRef.current,
        onStatus: setCamStatus,
      });
    } catch (err) {
      console.error("Head tracking failed:", err);
      setCamStatus("Erro ao acessar a câmera: " + (err?.message || err));
      setCamOn(false);
    }
  };

  useEffect(() => {
    return () => trackerRef.current?.stop();
  }, []);

  const renderAvatar = async () => {
    try {
      const { TalkingHead } = await loadModules();

      const head = new TalkingHead(avatarRef.current, {
        ttsEndpoint: import.meta.env.VITE_TTS_ENDPOINT,
        ttsApikey: import.meta.env.VITE_TTS_API_KEY,
        lipsyncModules: ["es"],
        cameraView: "upper",
      });

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
      head.start();
      head.playGesture("handup");
      setHeadInstance(head);
    } catch (error) {
      console.error("Failed to render avatar:", error);
    }
  };

  useEffect(() => {
    renderAvatar();
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
        <div style={styles.camRow} onClick={toggleCamera}>
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
        </div>
        <span style={styles.camHint}>
          {camStatus || (camOn ? "" : "Desativado — avatar no modo natural")}
        </span>
      </div>
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
};
