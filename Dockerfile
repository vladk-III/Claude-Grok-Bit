# Builds the web app and runs the API server, which also serves the web app.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY mobile/package.json mobile/
RUN npm ci --workspace server --workspace web --workspace shared --include-workspace-root
COPY shared shared
COPY server server
COPY web web
RUN npm run build
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
