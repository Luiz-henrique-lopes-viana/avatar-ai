import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const [headInstance, setHeadInstance] = useState(null);

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
};
