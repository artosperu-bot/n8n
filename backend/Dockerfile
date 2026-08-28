FROM node:22.16-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY .env.example ./
EXPOSE 3000
CMD ["node", "--env-file-if-exists=.env", "--experimental-strip-types", "src/server.ts"]
