# Step 12: Production-oriented Node.js Docker Container Build
FROM node:22-alpine

# Create application working directory
WORKDIR /app

# Copy package manifests for optimal layer caching
COPY package.json package-lock.json ./

# Install exact dependencies reproducibly
RUN npm ci

# Copy application source code into image
COPY . .

# Security Hardening: Adjust directory permissions and switch to non-root node user
RUN chown -R node:node /app
USER node

# Expose HTTP server port
EXPOSE 3000

# Server startup command
CMD ["npm", "start"]
