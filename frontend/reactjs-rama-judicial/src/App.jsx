import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ChatBot } from "./components/ChatBot";
import { Header } from "./components/header/header";

function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <Header />
        {/* <Canvas shadows camera={{ position: [0, 0, 8], fov: 42 }}>
          <color attach="background" args={["#ececec"]} />
          <Experience />
        </Canvas> */}
        <ChatBot />
      </QueryClientProvider>
    </>
  );
}

export default App;