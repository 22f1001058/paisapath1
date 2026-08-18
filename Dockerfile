# Stage 1: Build frontend and dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package configuration
COPY package.json package-lock.json ./

# Install dependencies including devDependencies for Vite build
RUN npm ci

# Copy full source code
COPY . .

# Build the frontend production bundle (outputs to dist/)
RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# Copy production package manifests
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled frontend build and backend source code
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY presentation ./presentation

# Create data directory for SQLite persistence volume mount
RUN mkdir -p /app/data

EXPOSE 8787

CMD ["node", "server/index.js"]
