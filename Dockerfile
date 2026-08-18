# Stage 1: Build frontend bundle on Linux
FROM node:22-slim AS builder

WORKDIR /app

# Copy ONLY package.json so npm installs Linux-native build tool binaries (Vite, Rolldown, LightningCSS)
COPY package.json ./

# Install dev dependencies dynamically for Linux
RUN npm install

# Copy source code and build Vite frontend into dist/
COPY . .
RUN npm run build

# Stage 2: Production Runner
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# Copy package manifests for production install
COPY package.json package-lock.json ./

# Install production runtime dependencies (Express, React)
RUN npm ci --omit=dev

# Copy compiled dist folder and backend server code
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY presentation ./presentation

# Create data directory for SQLite persistence volume mount
RUN mkdir -p /app/data

EXPOSE 8787

CMD ["node", "server/index.js"]
