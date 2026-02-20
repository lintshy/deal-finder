# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching — only re-runs npm install if 
# package.json changes, not every time your source code changes)
COPY package*.json tsconfig.json ./

RUN npm ci

# Copy source and build
COPY src/ ./src/
RUN npm run build


# ─── Stage 2: Lambda Runtime ──────────────────────────────────────────────────
# Use the official AWS Lambda Node.js base image — this is identical to the
# actual runtime environment your code will run in on AWS
FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy only the built output and production deps
COPY --from=builder /app/dist/handler.js ./
COPY package*.json ./

# Only install production dependencies (axios, AWS SDK) — skip devDeps
RUN npm ci --omit=dev

# Tell Lambda which function to invoke
CMD ["handler.handler"]