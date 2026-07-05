#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

# ComputeBay: publishes to GHCR (see .github/workflows/computebay.yml for CI).
# Requires `docker login ghcr.io` first. Override with COMPUTEBAY_IMAGE.
IMAGE=${COMPUTEBAY_IMAGE:-ghcr.io/avtechno-era/computebay-platform}

BUILDER=$(docker buildx create --use)

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
    echo PUSHING CANARY
        docker buildx build --platform linux/amd64 --pull --rm -t "${IMAGE}:${TAG}" -f 'Dockerfile' --push .
else
    echo  "PUSHING PRODUCTION"
    VERSION=$(node -p "require('./package.json').version")
    docker buildx build --platform linux/amd64 --pull --rm -t "${IMAGE}:latest" -t "${IMAGE}:${VERSION}" -f 'Dockerfile' --push .
fi

docker buildx rm $BUILDER

