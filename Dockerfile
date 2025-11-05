# Dockerfile
FROM mcr.microsoft.com/playwright:v1.56.1-focal
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4000
CMD ["npm","start"]

