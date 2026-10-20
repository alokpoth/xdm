FROM node:24-alpine

WORKDIR /app

# Install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy application source code
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Ensure persistent storage directory
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 19685

ENV NODE_ENV=production \
    LICENSE_SERVER_PORT=19685 \
    DATABASE_PATH=/app/data/licenses.db \
    ED25519_KEY_DIR=/app/data

VOLUME ["/app/data"]

CMD ["node", "server.js"]
