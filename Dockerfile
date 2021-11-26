# =====================
#     Base Image (LTS)
# =====================
FROM node:14.17-alpine AS base

# Create app directory
WORKDIR /opt/flowbroker-ui

RUN apk --no-cache add \
    bash \
    g++ \
    ca-certificates \
    lz4-dev \
    musl-dev \
    cyrus-sasl-dev \
    openssl-dev \
    make \
    python

RUN apk add --no-cache --virtual .build-deps \
    gcc \
    zlib-dev \
    libc-dev \
    bsd-compat-headers \
    py-setuptools \
    bash

# Install app dependencies
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY index.js ./index.js
COPY Gruntfile.js ./Gruntfile.js

COPY app ./app
COPY config ./config

# Build code for production
RUN npm install --only=prod
RUN npm run build

# =====================
#   Production Image
# =====================
FROM node:14.17-alpine

WORKDIR /opt/flowbroker-ui

# Dependencies for node-kafka
RUN apk --no-cache add \
    libsasl \
    lz4-libs \
    openssl \
    tini \
    curl

COPY --from=base /opt/flowbroker-ui /opt/flowbroker-ui

# Node-RED Default port
EXPOSE 2880

CMD ["npm", "run", "app"]

HEALTHCHECK --start-period=2m --interval=30s --timeout=10s --retries=3 \
 CMD curl -f http://localhost:9000/health || exit 1
