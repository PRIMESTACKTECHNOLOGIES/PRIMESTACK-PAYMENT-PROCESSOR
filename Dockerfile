# Use official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

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
