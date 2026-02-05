# Stage 1: Build the application
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy root package.json and pnpm-workspace.yaml
COPY package.json pnpm-workspace.yaml ./

# Copy the entire project context
COPY . .

# Install dependencies using pnpm
RUN npm install -g pnpm
RUN pnpm install --filter @brain-sync/api...

# Build the api application
RUN pnpm --filter @brain-sync/api build

# Stage 2: Production image
FROM node:20-slim

WORKDIR /app

# Copy built files from the builder stage
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Install production dependencies
RUN npm install -g pnpm
RUN pnpm install --prod

# Expose port and start the app
EXPOSE 6060
CMD ["node", "dist/index.js"]
