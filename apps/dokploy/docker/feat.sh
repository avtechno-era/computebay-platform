


# BUILDER=$(docker buildx create --use)

# docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "dokploy/dokploy:feature" -f 'Dockerfile' --push .

IMAGE=${COMPUTEBAY_IMAGE:-ghcr.io/avtechno-era/computebay-platform}

docker build --platform linux/amd64 --pull --rm -t "${IMAGE}:feature" -f 'Dockerfile' .

# docker  build --platform linux/amd64 --pull --rm -t "dokploy/dokploy:feature" -f 'Dockerfile' .
