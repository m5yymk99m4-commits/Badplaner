FROM node:22-alpine
WORKDIR /app
COPY server.js passwort.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "--no-warnings", "server.js"]
