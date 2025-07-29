import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import {
  AiFillDislike,
  AiFillLike,
  AiOutlineDislike,
  AiOutlineLike,
} from "react-icons/ai";
import { PulseLoader } from "react-spinners";
import { postMessageFeedBack, useChatMessage } from "../../api/chat";
import { AvatarTalkingHead } from "../AvatarTalkingHead";

export const ChatBot = () => {
  const [chatWindow, setChatWindow] = useState([
    {
      sender: "bot",
      sender_name: "Luiza",
      text: "¡Bienvenido! ¿Cómo puedo ayudarte?",
    },
  ]);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [inputRequest, setInputRequest] = useState("");
  const [playAudio, setPlayAudio] = useState(true);
  const { chat, isLoadingChat, sessionId } = useChatMessage({
    text: inputRequest,
  });

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const [feedbackInputs, setFeedbackInputs] = useState({});
  const [feedbackStatus, setFeedbackStatus] = useState({});

  const handleSendMessage = () => {
    const message = inputRef.current.value;
    if (!message.trim()) return;

    const newUserMessage = {
      sender: "user",
      sender_name: "Tú",
      text: message,
    };

    setChatWindow((prev) => [...prev, newUserMessage]);
    setInputRequest(message);
    inputRef.current.value = "";
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (!isLoadingChat && chat?.text) {
      const newBotMessage = {
        sender: "bot",
        sender_name: "Luiza",
        text: chat.text,
        responseId: chat.responseId,
      };
      setChatWindow((prev) => [...prev, newBotMessage]);
    }
  }, [chat]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatWindow, isLoadingChat]);

  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "es-ES";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputRef.current.value = transcript;
      };

      recognition.onerror = (event) => {
        console.error("Error en el reconocimiento de voz:", event.error);
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      console.warn(
        "La API SpeechRecognition no es compatible con este navegador."
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

  const handleSendFeedback = async (params) => {
    await postMessageFeedBack(params);
  };

  const toggleFeedbackInput = (responseId) => {
    setFeedbackInputs((prev) => ({
      ...prev,
      [responseId]: prev[responseId] === "" ? undefined : "",
    }));
  };

  const submitFeedback = async (responseId) => {
    if (feedbackInputs[responseId]?.trim()) {
      setIsSendingFeedback((prev) => ({ ...prev, [responseId]: true }));
      try {
        await postMessageFeedBack({
          rating: "THUMBS_DOWN",
          ratingReason: {
            feedback: feedbackInputs[responseId],
          },
          responseId,
        });
        setFeedbackInputs((prev) => ({
          ...prev,
          [responseId]: null,
        }));
        setFeedbackStatus((prev) => ({
          ...prev,
          [responseId]: { like: false, dislike: true, feedbackSubmitted: true },
        }));
      } finally {
        setIsSendingFeedback((prev) => ({ ...prev, [responseId]: false }));
      }
    }
  };

  const handleLikeClick = async (responseId) => {
    setFeedbackStatus((prev) => ({
      ...prev,
      [responseId]: { like: true, dislike: false },
    }));
  
    setFeedbackInputs((prev) => ({
      ...prev,
      [responseId]: undefined,
    }));
  
    await postMessageFeedBack({
      rating: "THUMBS_UP",
      ratingReason: {
        feedback: "",
      },
      responseId: responseId,
    });
  };

  return (
    <div>
      <div className="fixed bottom-5 right-5 w-[300px] h-[80vh] max-h-[500px] z-[1000] overflow-hidden shadow-lg bg-black/80 rounded-2xl flex flex-col backdrop-blur-md">
        <div className="flex items-center p-2.5 bg-black/20 text-white gap-2.5">
          <div
            className="rounded-full overflow-hidden border-[2px] border-white/25"
            style={{
              width: "50px",
            }}
          >
            <img
              src="/textures/avatar3x4.png"
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="w-full flex flex-row justify-between">
            <p className="text-lg font-bold font-sans">Luiza AI</p>
            <button
              onClick={() => {
                setPlayAudio((prev) => !prev);
              }}
              className={clsx(
                "text-xs px-2 py-1 rounded font-medium transition-colors",
                playAudio
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-gray-500 hover:bg-gray-600 text-white"
              )}
            >
              {playAudio ? "Voz ON " : "Voz OFF"}
            </button>
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
          <div className="flex flex-col gap-2">
            {chatWindow.map((message, index) => (
              <div
                key={index}
                className={`text-sm leading-snug font-sans rounded-lg px-3 py-1.5 ${
                  message.sender === "user"
                    ? "bg-gradient-to-r from-[#83c5d2] to-[#1e90b0] text-white text-right"
                    : "bg-white/30 text-white/80"
                }`}
              >
                <p className="font-semibold text-xs">{message.sender_name}</p>
                <p>{message.text}</p>
                {message.sender === "bot" && index !== 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex gap-2">
                      {feedbackStatus[message.responseId]?.like ? (
                        <button
                          className="focus:outline-none cursor-default"
                          disabled
                        >
                          <AiFillLike size={20} />
                        </button>
                      ) : (
                        !feedbackStatus[message.responseId]?.dislike && (
                          <button
                            onClick={() => handleLikeClick(message.responseId)}
                            className="focus:outline-none cursor-pointer"
                          >
                            <AiOutlineLike
                              size={20}
                              color={"bg-white"}
                            />
                          </button>
                        )
                      )}
                      {feedbackStatus[message.responseId]?.dislike ? (
                        <button
                          className="focus:outline-none cursor-default"
                          disabled
                        >
                          <AiFillDislike size={20} />
                        </button>
                      ) : (
                        !feedbackStatus[message.responseId]?.like && (
                          <button
                            onClick={() =>
                              toggleFeedbackInput(message.responseId)
                            }
                            className="focus:outline-none cursor-pointer"
                          >
                            <AiOutlineDislike
                              size={20}
                              color={"bg-white"}
                            />
                          </button>
                        )
                      )}
                    </div>

                    {feedbackInputs[message.responseId] !== undefined &&
                      !feedbackStatus[message.responseId]
                        ?.feedbackSubmitted && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={feedbackInputs[message.responseId] ?? ""}
                            onChange={(e) =>
                              setFeedbackInputs((prev) => ({
                                ...prev,
                                [message.responseId]: e.target.value,
                              }))
                            }
                            placeholder="Escribe tus comentarios..."
                            className="w-full p-2 text-sm rounded-lg border border-gray-300 bg-white text-black"
                          />
                          <button
                            onClick={() => submitFeedback(message.responseId)}
                            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isSendingFeedback[message.responseId]}
                          >
                            {isSendingFeedback[message.responseId]
                              ? "Enviando..."
                              : "Enviar"}
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </div>
            ))}
            {isLoadingChat && (
              <div>
                <PulseLoader color="#fff" />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center px-3 pt-3 bg-black/30">
          <textarea
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-white/70 text-sm font-sans p-1 resize-none"
            placeholder="Escribe tu mensaje..."
            onKeyDown={handleKeyPress}
          ></textarea>
          <button
            onClick={handleSendMessage}
            className="ml-2 bg-[#248a52] hover:bg-[#1d7745] text-white text-sm p-2 px-3 rounded-lg transition-colors disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoadingChat}
          >
            Enviar
          </button>
          <div className="flex flex-col items-center ml-2">
            <button
              onClick={() => {
                if (isRecording) {
                  stopRecording();
                } else {
                  startRecording();
                }
              }}
              className={clsx(
                "p-2 bg-[#248a52] hover:bg-[#1d7745] rounded-lg transition-colors flex items-center justify-center disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed",
                isRecording && "bg-red-600 hover:bg-red-700"
              )}
              aria-label={isRecording ? "Parar grabación" : "Iniciar grabación"}
              disabled={isLoadingChat}
            >
              <div>
                <img
                  src={"/assets/mic.svg"}
                  alt="Micrófono"
                  className="w-5 h-5"
                  style={{ width: "31px" }}
                />
              </div>
            </button>
          </div>
        </div>
        {isRecording && (
          <div className="flex w-full justify-end mb-1 pr-4">
            <span className=" text-xs text-gray-300  animate-pulse  text-right">
              Grabando mensage...
            </span>
          </div>
        )}
      </div>
      <AvatarTalkingHead
        message={chat?.text || ""}
        playAudio={playAudio}
      />
    </div>
  );
};
