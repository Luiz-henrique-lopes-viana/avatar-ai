import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { PulseLoader } from "react-spinners";
import { chat as localChat, initLocalAI, isWebGPUAvailable } from "../../api/localAI";
import { useConversaMode } from "../../store/useConversaMode";
import { AvatarTalkingHead } from "../AvatarTalkingHead";

export const ChatBot = () => {
  const [chatWindow, setChatWindow] = useState([
    {
      sender: "bot",
      sender_name: "Luiza",
      text: "Olá! Como posso ajudar você?",
    },
  ]);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const avatarRef = useRef(null);

  // The whole "brain" is a local, keyless WebLLM model running in the browser
  // (WebGPU). There is no backend: every reply is generated on the user's
  // machine and nothing ever leaves it.
  const conversaOn = useConversaMode((s) => s.conversaOn); // voz ligada?
  const setConversa = useConversaMode((s) => s.setConversa);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState("");
  const [aiError, setAiError] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const historyRef = useRef([]); // [{role, content}] context for WebLLM
  const sendRef = useRef(null); // latest handleSendMessage, for voice auto-send

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  // Lazily download + start the in-browser model. Returns true when it's ready
  // to answer, false (with a friendly message) when WebGPU is missing or the
  // download failed.
  const ensureModel = async () => {
    if (modelReady) return true;
    const ok = await isWebGPUAvailable();
    if (!ok) {
      setAiError(
        "Seu navegador não tem WebGPU. Use o Chrome ou o Edge atualizados para conversar com a Luiza."
      );
      return false;
    }
    setAiError("");
    setModelLoading(true);
    try {
      await initLocalAI((report) => {
        setModelProgress(report?.progress || 0);
        setModelStatus(report?.text || "");
      });
      setModelReady(true);
      setModelStatus("");
      return true;
    } catch (err) {
      console.error("Falha ao iniciar a IA local:", err);
      setAiError(err?.message || "Erro ao carregar o modelo de IA.");
      return false;
    } finally {
      setModelLoading(false);
    }
  };

  const handleSendMessage = async () => {
    const message = inputRef.current.value;
    if (!message.trim() || isThinking || modelLoading) return;

    setChatWindow((prev) => [
      ...prev,
      { sender: "user", sender_name: "Você", text: message },
    ]);
    inputRef.current.value = "";

    const ready = await ensureModel();
    if (!ready) return;

    const history = [...historyRef.current, { role: "user", content: message }];
    historyRef.current = history;
    setIsThinking(true);
    try {
      const reply = await localChat(history);
      historyRef.current = [...history, { role: "assistant", content: reply }];
      setChatWindow((prev) => [
        ...prev,
        { sender: "bot", sender_name: "Luiza", text: reply },
      ]);
      // Fala em voz alta só quando a voz está ligada.
      if (conversaOn) avatarRef.current?.speak(reply);
    } catch (err) {
      console.error("Erro na IA local:", err);
      setChatWindow((prev) => [
        ...prev,
        {
          sender: "bot",
          sender_name: "Luiza",
          text: "Desculpe, tive um problema ao gerar a resposta.",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // Keep a live reference so voice recognition (set up once) can auto-send.
  sendRef.current = handleSendMessage;

  // "Ativar voz": liga/desliga a fala da avatar. Ao ligar, já pré-carrega o
  // modelo para a primeira resposta sair falando sem espera.
  const toggleConversa = async () => {
    if (modelLoading) return;
    if (conversaOn) {
      setConversa(false);
      avatarRef.current?.stop();
      return;
    }
    setConversa(true);
    const ok = await ensureModel();
    if (!ok) setConversa(false);
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatWindow, isThinking]);

  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputRef.current.value = transcript;
        setIsRecording(false);
        // Falar uma mensagem já a envia.
        sendRef.current?.();
      };

      recognition.onerror = (event) => {
        console.error("Erro no reconhecimento de voz:", event.error);
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      console.warn(
        "A API SpeechRecognition não é compatível com este navegador."
      );
    }
  }, []);

  const startRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div>
      <div className="fixed bottom-5 right-5 w-[340px] h-[82vh] max-h-[540px] z-[1000] overflow-hidden rounded-2xl flex flex-col bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_-10px_rgba(2,32,71,0.75)]">
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9] text-white">
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/70 shadow-md">
              <img
                src="/textures/avatar3x4.png"
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-[#1e3a8a]" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <p className="text-base font-bold leading-none tracking-tight font-sans">
                Luiza AI
              </p>
              <span className="text-[11px] text-white/80 leading-none">
                Assistente virtual
              </span>
            </div>
            <button
              onClick={toggleConversa}
              disabled={modelLoading}
              className={clsx(
                "text-xs px-2.5 py-1 rounded-full font-semibold transition-all self-start flex items-center gap-1.5 shadow-sm disabled:opacity-70 disabled:cursor-wait",
                conversaOn
                  ? "bg-white text-[#1d4ed8] hover:bg-white/90"
                  : "bg-white/15 text-white hover:bg-white/25 backdrop-blur"
              )}
            >
              <span
                className={clsx(
                  "inline-block w-2 h-2 rounded-full",
                  conversaOn ? "bg-green-500 animate-pulse" : "bg-white/50"
                )}
              />
              {modelLoading
                ? `Carregando IA ${Math.round(modelProgress * 100)}%`
                : conversaOn
                ? "🔊 Falando"
                : "🔊 Ativar voz"}
            </button>
            {modelLoading && (
              <div className="w-full h-1 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: `${Math.round(modelProgress * 100)}%` }}
                />
              </div>
            )}
            {modelLoading && modelStatus && (
              <span className="text-[10px] text-white/70 leading-tight truncate">
                {modelStatus}
              </span>
            )}
            {aiError && (
              <span className="text-[10px] text-red-50 bg-red-500/40 rounded px-1.5 py-0.5 leading-tight">
                {aiError}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex-1 text-white/80 overflow-y-auto p-2.5 scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent hover:scrollbar-thumb-white/50"
          ref={chatContainerRef}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "transparent transparent",
          }}
        >
          <div className="flex flex-col gap-2.5">
            {chatWindow.map((message, index) => (
              <div
                key={index}
                className={`max-w-[85%] text-sm leading-snug font-sans rounded-2xl px-3.5 py-2 shadow-sm ${
                  message.sender === "user"
                    ? "self-end bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white rounded-br-sm"
                    : "self-start bg-white/10 text-white/90 border border-white/10 rounded-bl-sm"
                }`}
              >
                <p
                  className={clsx(
                    "font-semibold text-[11px] mb-0.5",
                    message.sender === "user" ? "text-white/80" : "text-[#7dd3fc]"
                  )}
                >
                  {message.sender_name}
                </p>
                <p>{message.text}</p>
              </div>
            ))}
            {isThinking && (
              <div className="self-start bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <PulseLoader color="#60a5fa" size={8} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2 px-3 py-3 bg-black/40 border-t border-white/10">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-white/10 rounded-xl border border-white/10 focus:border-[#3b82f6] outline-none text-white/90 placeholder-white/40 text-sm font-sans px-3 py-2 resize-none max-h-24 transition-colors"
            placeholder={
              modelLoading ? "Carregando a IA..." : "Escreva sua mensagem..."
            }
            onKeyDown={handleKeyPress}
          ></textarea>
          <button
            onClick={handleSendMessage}
            className="shrink-0 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white p-2.5 rounded-xl transition-all shadow-md disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isThinking || modelLoading}
            aria-label="Enviar mensagem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (isRecording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            className={clsx(
              "shrink-0 p-2.5 rounded-xl transition-all shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed",
              isRecording
                ? "bg-red-600 hover:bg-red-700 animate-pulse"
                : "bg-white/10 hover:bg-white/20 border border-white/10"
            )}
            aria-label={isRecording ? "Parar gravação" : "Iniciar gravação"}
            disabled={isThinking || modelLoading}
          >
            <img src={"/assets/mic.svg"} alt="Microfone" className="w-5 h-5" />
          </button>
        </div>
        {isRecording && (
          <div className="flex w-full justify-end mb-1 pr-4">
            <span className="text-xs text-sky-300 animate-pulse text-right">
              Gravando mensagem...
            </span>
          </div>
        )}
      </div>
      <AvatarTalkingHead ref={avatarRef} playAudio={conversaOn} />
    </div>
  );
};
