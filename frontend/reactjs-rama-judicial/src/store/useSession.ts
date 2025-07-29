import { create } from "zustand";
import { createSessionId } from "../utils/chat";




interface SessionStoreState {
    sessionId: string;
    setSession: (value: string) => void;
    clearSession: () => void;
    // hasPermission: (value: string) => boolean;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
    sessionId: createSessionId(),
    setSession: (value: string) => set({ sessionId: value }),
    clearSession: () => set({ sessionId: "" }),
}));
