



# Builder stage
FROM node:18-bullseye AS builder

WORKDIR /app

# Only copy package.json and lock first to take advantage of Docker cache
COPY package*.json ./
RUN npm install

# Now copy the rest of the app
COPY . .

# Final stage
FROM node:18-bullseye

WORKDIR /app

# Copy only what's necessary
COPY --from=builder /app ./

# If needed: only install prod dependencies
RUN npm install --omit=dev

EXPOSE 3000

CMD ["node", "server.js"]
