import { useEffect, useLayoutEffect, useRef, useState } from "react";

const loadModules = async () => {
  const { TalkingHead } = await import("./talkinghead/modules/talkinghead.mjs");
  return { TalkingHead };
};

export const AvatarTalkingHead = ({ message, playAudio }) => {
  const avatarRef = useRef(null);
  const [headInstance, setHeadInstance] = useState(null);

  const renderAvatar = async () => {
    const { TalkingHead } = await loadModules();

    const head = new TalkingHead(avatarRef.current, {
      ttsEndpoint: import.meta.env.VITE_TTS_ENDPOINT,
      ttsApikey: import.meta.env.VITE_TTS_API_KEY,
      lipsyncModules: ["es"],
      cameraView: "upper",
    });

    try {
      await head.showAvatar(
        {
          url: "/models/6806bf365a7750626bb8c233.glb",
          body: "F",
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
      console.error(error);
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
    if (!playAudio) {
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
