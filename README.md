# 🤖 Luiza AI

Avatar 3D feminina que conversa em **português (pt-BR)** por texto e voz, com
sincronia labial (lip-sync por fonema) e que pode **imitar seus movimentos pela
webcam**. Tudo roda **100% no navegador** — sem backend e sem chave de API
exposta: a IA que gera as respostas é um modelo que baixa e executa localmente
na sua máquina, então a conversa nunca sai do seu computador.

## ✨ Funcionalidades

- **Chat com IA local** — respostas geradas em pt-BR por um LLM rodando no
  navegador via WebGPU (keyless, gratuito, offline depois do primeiro download).
- **Avatar 3D que fala** — a Luiza narra as respostas com voz pt-BR e lip-sync.
- **Reconhecimento de voz** — fale sua mensagem (SpeechRecognition, push-to-talk).
- **Copiar meus movimentos** — a avatar espelha cabeça, olhos, boca, braços e
  mãos capturados pela webcam (MediaPipe). Mutuamente exclusivo com o modo voz.
- Interface responsiva e moderna.

## 🧰 Stack

- **Frontend:** React 18 + Vite, Tailwind CSS, Zustand, TanStack Query.
- **LLM (o "cérebro"):** [WebLLM](https://github.com/mlc-ai/web-llm)
  (`@mlc-ai/web-llm`), modelo `Llama-3.2-3B-Instruct` rodando no navegador via
  WebGPU (Web Worker). Nenhuma chamada a servidor, nenhuma chave.
- **Avatar 3D:** [TalkingHead](https://github.com/met4citizen/TalkingHead)
  sobre Three.js/WebGL, com modelos GLB do
  [Ready Player Me](https://readyplayer.me).
- **Voz (TTS):** Google Cloud Text-to-Speech (voz pt-BR) para o áudio falado.
- **Face/pose tracking:** MediaPipe Tasks Vision (Face/Pose/Hand Landmarker).
- **Reconhecimento de voz:** Web Speech API (SpeechRecognition).

## 🚀 Como rodar

```bash
cd frontend/reactjs-luiza-ai
cp .env.example .env.local   # preencha a chave do Google TTS
npm install
npm run dev                  # http://localhost:5173
```

> **Requisitos:** um navegador com **WebGPU** (Chrome ou Edge atualizados) para o
> chat com IA. No primeiro uso, o modelo (~1,8 GB) é baixado e fica em cache.

### Variáveis de ambiente (`frontend/reactjs-luiza-ai/.env.local`)

| Variável            | Descrição                                             |
| ------------------- | ----------------------------------------------------- |
| `VITE_TTS_ENDPOINT` | Endpoint do Google Cloud Text-to-Speech.              |
| `VITE_TTS_API_KEY`  | Chave do Google TTS (nunca faça commit dela).         |
| `VITE_AVATAR_URL`   | URL do `.glb` do avatar (padrão: modelo local).       |
| `VITE_AVATAR_ID`    | Alternativa: ID de um avatar Ready Player Me.         |
| `VITE_AVATAR_BODY`  | `F` (feminino) ou `M` (masculino).                    |

## 🔒 Privacidade

O texto das respostas é gerado localmente pelo WebLLM — nada é enviado a um
servidor de IA. A única chamada externa é o Google TTS, usado apenas para
converter em áudio o texto que já apareceu no chat.
