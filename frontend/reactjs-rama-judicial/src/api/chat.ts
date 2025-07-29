import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "../store/useSession";
import { appFetch } from "./_";

type ChatResponse = {
  text: string;
  responseId: string;
};

interface listChatMessageParams {
  sessionId: string;
  text?: string;
}

export type PostFeedbackParams = {
  rating: string;
  ratingReason: {
    feedback: string;
  };
  responseId?: string;
};

// API Calls
const listChatMessage = async (
  params: listChatMessageParams
): Promise<ChatResponse> => {
  const chat_response = await appFetch("/api/message", {
    options: {
      method: "POST",
      body: JSON.stringify(params),
    },
  });

  return chat_response;
};

export const postMessageFeedBack = async (params: PostFeedbackParams) => {
  const feedback_response = await appFetch("/api/feedback", {
    options: {
      method: "POST",
      body: JSON.stringify(params),
    },
  });

  return feedback_response;
};

// Hooks
export const useChatMessage = ({ text }: { text?: string }) => {
  const { sessionId } = useSessionStore();
  const {
    data: chat,
    isLoading: isLoadingChat,
    refetch: refetchChat,
  } = useQuery<ChatResponse>({
    queryKey: ["chat", text],
    queryFn: () => listChatMessage({ text, sessionId }),
    enabled: !!text,
    retry: false,
    retryDelay: 10000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return {
    chat,
    isLoadingChat,
    refetchChat,
    sessionId,
  };
};
