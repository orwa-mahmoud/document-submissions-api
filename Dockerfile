FROM node:22-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
USER app
EXPOSE 3000
CMD ["npx", "tsx", "src/composition/main.ts"]
