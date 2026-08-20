import { create } from "zustand";

// Coordinates the two mutually-exclusive avatar modes in one place:
// - conversaOn: local WebLLM conversational AI (avatar speaks + gestures)
// - camOn:      webcam motion mirroring ("Copiar meus movimentos")
// Turning one on always turns the other off, so the tracker and the AI never
// fight over the avatar at the same time.
interface ConversaModeState {
  conversaOn: boolean;
  camOn: boolean;
  setConversa: (value: boolean) => void;
  setCam: (value: boolean) => void;
}

export const useConversaMode = create<ConversaModeState>((set, get) => ({
  conversaOn: false,
  camOn: false,
  setConversa: (value: boolean) =>
    set({ conversaOn: value, camOn: value ? false : get().camOn }),
  setCam: (value: boolean) =>
    set({ camOn: value, conversaOn: value ? false : get().conversaOn }),
}));
