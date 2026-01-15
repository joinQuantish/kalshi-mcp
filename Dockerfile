# Kalshi SDK MCP Server v2.0 - with export/import private key tools
FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Cache busting - change this value to force rebuild
ARG CACHE_BUST=v0.3.1-auth-fix

# Copy source and build
COPY . .
RUN npm run build

# Expose port
EXPOSE 3002

# Copy start script and make executable
COPY start.sh ./
RUN chmod +x start.sh

# Run database migrations and start
CMD ["./start.sh"]

