# The official Ubuntu digest and incident-specific CA package are reviewed together.
FROM docker.io/library/ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install --yes --no-install-recommends \
      ca-certificates=20260816ubuntu0.24.04.1 curl xz-utils python3 bash git \
      xvfb fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6 \
      xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic fonts-wqy-zenhei \
      fonts-tlwg-loma-otf fonts-freefont-ttf libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
      libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 \
      libgbm1 libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 \
      libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxkbcommon0 libxrandr2 \
 && test "$(dpkg-query --show --showformat='${Version}' ca-certificates)" = 20260816ubuntu0.24.04.1 \
 && rm -rf /var/lib/apt/lists/*
COPY bootstrap.sh /opt/company/bootstrap.sh
COPY artifacts.json /opt/company/artifacts.json
COPY validate-pnpm-archive.py /opt/company/validate-pnpm-archive.py
RUN bash /opt/company/bootstrap.sh
COPY entrypoint.sh /opt/company/entrypoint.sh
COPY check-node-version.mjs /opt/company/check-node-version.mjs
COPY pack-regular.py /opt/company/pack-regular.py
COPY package.json /opt/company/package.json
COPY check-pnpm-version.mjs /opt/company/scripts/check-pnpm-version.mjs
COPY assert-project-policy.mjs /opt/company/assert-project-policy.mjs
ENV PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    NODE_USE_SYSTEM_CA=1 \
    npm_config_manage_package_manager_versions=false
ENTRYPOINT ["/bin/bash", "-p", "/opt/company/entrypoint.sh"]
