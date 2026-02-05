# Stage 1: Build the application
FROM node:20-slim AS builder

WORKDIR /app

# Copy root package.json and pnpm-workspace.yaml
COPY package.json pnpm-workspace.yaml ./

# Copy the entire project context
COPY . .

# Install dependencies using pnpm
RUN npm install -g pnpm
RUN pnpm install --filter web...

# Build the web application
RUN pnpm --filter web build

# Stage 2: Production image
FROM node:20-slim

WORKDIR /app

# Set up the Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Expose port and start the app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
