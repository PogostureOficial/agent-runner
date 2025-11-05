FROM mcr.microsoft.com/playwright:v1.56.0-jammy
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
CMD ["npm","start"]


