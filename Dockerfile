# Use official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install build toolchain required to compile native modules (e.g. better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (build native modules from source)
RUN npm ci --only=production

# Remove build toolchain to keep the image small
RUN apk del python3 make g++

# Copy application code
COPY . .

# Create data directory for database
RUN mkdir -p data && chown -R node:node data

# Switch to non-root user
USER node

# Expose the port the app runs on
EXPOSE 6001

# Start the application
CMD ["node", "index.js"]
