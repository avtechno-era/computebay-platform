#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
else
    VERSION=$(node -p "require('./package.json').version")
    TAG="$VERSION"
fi

# ComputeBay: publishes to GHCR (see .github/workflows/computebay.yml for CI).
# Override IMAGE with COMPUTEBAY_IMAGE if you point at a different registry/repo.
IMAGE=${COMPUTEBAY_IMAGE:-ghcr.io/avtechno-era/computebay-platform}

BUILDER=$(docker buildx create --use)

docker buildx build --platform linux/amd64 --pull --rm -t "${IMAGE}:${TAG}" -f 'Dockerfile' .

docker buildx rm $BUILDER
