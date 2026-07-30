FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps ./apps
COPY --from=dependencies /app/packages ./packages
COPY package.json ./
COPY apps/worker ./apps/worker
RUN npm run build --workspace @timetable/worker

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/worker/dist ./dist
CMD ["node", "dist/index.js"]
