FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
