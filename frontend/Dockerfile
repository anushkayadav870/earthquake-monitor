FROM node:18-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# Expose Vite port
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
