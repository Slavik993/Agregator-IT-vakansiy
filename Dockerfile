FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

EXPOSE 3000

CMD ["sh", "-c", "npm run seed && npm start"]