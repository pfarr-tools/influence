FROM node:24-bookworm

ARG UID=1000
ARG GID=1000

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        chromium \
        ffmpeg \
        fonts-atkinson-hyperlegible \
        fonts-dejavu \
        ca-certificates \
        make \
        g++ \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid "${GID}" influence \
    && useradd --uid "${UID}" --gid "${GID}" --create-home --shell /bin/bash influence

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=development

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --chown=influence:influence . .

USER influence

CMD ["sleep", "infinity"]
