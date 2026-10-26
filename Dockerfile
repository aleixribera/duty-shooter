# Build stage: install the workspace, build the range client and bundle the server.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/fps-core/package.json packages/fps-core/
COPY packages/fps-client/package.json packages/fps-client/
COPY apps/range/package.json apps/range/
COPY apps/server/package.json apps/server/
RUN npm ci
COPY packages ./packages
COPY apps ./apps
RUN npm run build -w @duty-shooter/range && npm run build -w @duty-shooter/server

# Runtime stage: the bundled server, its one npm dependency (ws) and the static client.
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/aleixribera/duty-shooter"
LABEL org.opencontainers.image.description="Duty Shooter: browser FPS with an authoritative 60 Hz server"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# ws has no runtime dependencies of its own.
COPY --from=build /src/node_modules/ws ./node_modules/ws
COPY --from=build /src/apps/server/dist/main.js ./server/main.mjs
COPY --from=build /src/apps/range/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
