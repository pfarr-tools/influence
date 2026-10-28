FROM node:24-bookworm

ARG UID=1000
ARG GID=1000

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        chromium \
        ffmpeg \
        fonts-liberation \
        fonts-dejavu \
        ca-certificates \
        make \
        g++ \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && if getent passwd "${UID}" >/dev/null; then \
         existing_user="$(getent passwd "${UID}" | cut -d: -f1)"; \
         test "${existing_user}" = node; \
         usermod --login influence --home /home/influence --move-home node; \
         groupmod --new-name influence node; \
       else \
         getent group "${GID}" >/dev/null || groupadd --gid "${GID}" influence; \
         useradd --uid "${UID}" --gid "${GID}" --create-home --shell /bin/bash influence; \
       fi

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=development

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY --chown=influence:influence . .

USER influence

CMD ["sleep", "infinity"]
