import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { startHeadTracking } from "./headTracking";
import { useConversaMode } from "../../store/useConversaMode";

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

export const AvatarTalkingHead = forwardRef(({ message, playAudio }, ref) => {
  const avatarRef = useRef(null);
  const videoRef = useRef(null);
  const trackerRef = useRef(null);
  const headRef = useRef(null);
  const [headInstance, setHeadInstance] = useState(null);
  // camOn is shared state: turning on "Modo conversa" (in the chat) flips it
  // off, which stops the tracker via the effect below.
  const camOn = useConversaMode((s) => s.camOn);
  const setCam = useConversaMode((s) => s.setCam);
  const [camStatus, setCamStatus] = useState("");
  const [camLoading, setCamLoading] = useState(false);
  const [camDebug, setCamDebug] = useState(null);

  const toggleCamera = async () => {
    if (camLoading) return; // ignore clicks while starting
    if (camOn) {
      setCam(false); // the effect below tears down the tracker + resets UI
      return;
    }
    if (!headInstance) {
      setCamStatus("Aguarde o avatar carregar...");
      return;
    }
    try {
      setCam(true);
      setCamLoading(true);
      setCamStatus("Carregando rastreamento...");
      trackerRef.current = await startHeadTracking({
        head: headInstance,
        video: videoRef.current,
        onStatus: setCamStatus,
        onSynced: () => {
          setCamLoading(false);
        },
        onDebug: setCamDebug,
      });
    } catch (err) {
      console.error("Head tracking failed:", err);
      setCamStatus("Erro ao acessar a câmera: " + (err?.message || err));
      setCam(false);
      setCamLoading(false);
    }
  };

  // Whenever camOn drops to false — whether from the toggle above or because
  // "Modo conversa" was switched on elsewhere — stop the tracker and reset.
  useEffect(() => {
    if (!camOn && trackerRef.current) {
      trackerRef.current.stop();
      trackerRef.current = null;
      setCamStatus("");
      setCamDebug(null);
      setCamLoading(false);
    }
  }, [camOn]);

  // Imperative API used by the chat's "Modo conversa": speak a pt-BR reply.
  // stopSpeaking() first so a new reply interrupts the queued one.
  useImperativeHandle(
    ref,
    () => ({
      speak: (text) => {
        if (!headInstance || !text) return;
        headInstance.stopSpeaking();
        // pt-BR-Neural2-C = voz feminina neural (natural). lipsyncLang "es"
        // é o que sincroniza a boca com os timepoints do áudio (fonema).
        headInstance.speakText(text, {
          ttsLang: "pt-BR",
          ttsVoice: "pt-BR-Neural2-C",
          lipsyncLang: "es",
          ttsRate: 0.95,
        });
      },
      stop: () => headInstance?.stopSpeaking(),
    }),
    [headInstance]
  );

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
          // Cabeça ESTÁTICA enquanto fala (0) e movimento natural quando
          // parada (0.5). O state machine da TalkingHead alterna sozinho
          // entre "speaking" e "idle" ao começar/terminar a fala.
          avatarSpeakingHeadMove: 0,
          avatarIdleHeadMove: 0.5,
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

      <div
        style={{
          ...styles.camPanel,
          borderColor: camOn
            ? "rgba(36,138,82,0.55)"
            : "rgba(255,255,255,0.12)",
          boxShadow: camOn
            ? "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(36,138,82,0.25)"
            : "0 8px 28px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{ ...styles.camRow, cursor: camLoading ? "wait" : "pointer" }}
          onClick={toggleCamera}
        >
          <span
            style={{
              ...styles.camIcon,
              background: camOn
                ? "linear-gradient(135deg,#248a52,#37d67a)"
                : "rgba(255,255,255,0.10)",
            }}
          >
            🎥
          </span>

          <div style={styles.camTexts}>
            <span style={styles.camLabel}>Copiar meus movimentos</span>
            <span style={styles.camHint}>
              {camLoading
                ? "Iniciando câmera…"
                : camStatus ||
                  (camOn
                    ? "Rastreando você em tempo real"
                    : "Ative para a Luiza imitar você")}
            </span>
          </div>

          {camLoading ? (
            <span style={styles.spinner} />
          ) : (
            <span
              style={{
                ...styles.switch,
                background: camOn
                  ? "linear-gradient(135deg,#248a52,#37d67a)"
                  : "rgba(255,255,255,0.22)",
              }}
            >
              <span
                style={{
                  ...styles.switchKnob,
                  transform: camOn ? "translateX(20px)" : "translateX(0px)",
                }}
              />
            </span>
          )}
        </div>

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
});

AvatarTalkingHead.displayName = "AvatarTalkingHead";

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
  // Card do rastreamento por câmera — alinhado à direita, na mesma coluna
  // do chat (right: 20, width: 300), combinando com o visual dele.
  camPanel: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 300,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "14px 16px",
    background: "rgba(0,0,0,0.8)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    backdropFilter: "blur(10px)",
    boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    zIndex: 1001,
  },
  camRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
  },
  camIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    transition: "background 0.2s ease",
  },
  camTexts: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
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
    fontWeight: 700,
    lineHeight: 1.2,
  },
  camHint: {
    fontSize: 11.5,
    opacity: 0.7,
    lineHeight: 1.3,
  },
  camDebug: {
    fontSize: 11,
    opacity: 0.55,
    fontFamily: "monospace",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    paddingTop: 8,
  },
  spinner: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.25)",
    borderTopColor: "#37d67a",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
  },
};
