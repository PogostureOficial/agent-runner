FROM mcr.microsoft.com/playwright:focal
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
CMD ["npm","start"]
