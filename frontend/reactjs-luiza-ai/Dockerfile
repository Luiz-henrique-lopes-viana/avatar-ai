# Etapa de build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia os arquivos de dependência e instala
COPY package*.json ./
RUN npm install

# Copia o restante do código da aplicação
COPY . .

# Faz o build da aplicação com o Vite
RUN npm run build

# Etapa de produção
FROM node:20-alpine AS production

WORKDIR /app

# Instala o 'serve' para servir arquivos estáticos
RUN npm install -g serve

# Copia apenas os arquivos de build gerados
COPY --from=builder /app/dist /app/dist
COPY .env.production .env.production

# Expõe a porta padrão usada pelo 'serve'
EXPOSE 8080

# Comando para servir os arquivos estáticos
CMD ["serve", "-s", "dist", "-l", "8080"]
