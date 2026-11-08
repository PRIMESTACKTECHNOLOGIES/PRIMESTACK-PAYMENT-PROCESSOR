# Use official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install build toolchain to compile native modules (better-sqlite3) and su-exec
# to drop privileges to the non-root user at runtime.
RUN apk add --no-cache python3 make g++ su-exec

# Copy package files
COPY package*.json ./

# Install dependencies (build native modules from source)
RUN npm ci --only=production

# Remove build-only toolchain to keep the image small
RUN apk del python3 make g++

# Copy application code
COPY . .

# Create data directory and make the app tree writable by the non-root user
RUN mkdir -p data && chown -R node:node /app

# Expose the port the app runs on
EXPOSE 6001

# Start as root only to fix ownership of the persistent disk mount (Render mounts
# disks as root), then drop privileges and run the app as the non-root 'node' user.
CMD ["sh", "-c", "D=\"${DATA_DIR:-/app/data}\"; mkdir -p \"$D\" && chown -R node:node \"$D\" 2>/dev/null; exec su-exec node node index.js"]
