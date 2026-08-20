import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ChatBot } from "./components/ChatBot";

function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ChatBot />
    </QueryClientProvider>
  );
}

export default App;
