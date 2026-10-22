# The official Ubuntu digest and incident-specific CA package are reviewed together.
FROM docker.io/library/ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517
ENV DEBIAN_FRONTEND=noninteractive
RUN test "$(dpkg --print-architecture)" = amd64 \
 && grep --quiet --fixed-strings 'VERSION_ID="24.04"' /etc/os-release \
 && rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
 && printf '%s\n' 'Types: deb' 'URIs: http://archive.ubuntu.com/ubuntu' 'Suites: noble noble-updates' 'Components: main universe' 'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' '' 'Types: deb' 'URIs: http://security.ubuntu.com/ubuntu' 'Suites: noble-security' 'Components: main universe' 'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' > /etc/apt/sources.list.d/ubuntu.sources \
 && printf '%s\n' 'Acquire::AllowInsecureRepositories "false";' 'Acquire::AllowDowngradeToInsecureRepositories "false";' 'Acquire::Check-Valid-Until "true";' 'APT::Get::AllowUnauthenticated "false";' > /etc/apt/apt.conf.d/99company-authentication \
 && apt-get update --error-on=any \
 && mkdir -m 0755 /var/cache/company-checkout-archives \
 && apt-get -o Dir::Cache::archives=/var/cache/company-checkout-archives install --download-only --reinstall --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl curl xz-utils python3 bash git xvfb fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6 xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
 && test -f /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb \
 && test ! -L /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb \
 && test "$(stat -c %s /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb)" = 138884 \
 && printf '%s  %s\n' 8a0a754aaafed72cc8efb8c1731808133284a84fbfc76a4fcc73fce9e01b4187 /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb | sha256sum --check --strict --status \
 && apt-get -o Dir::Cache::archives=/var/cache/company-checkout-archives install --no-download --reinstall --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl curl xz-utils python3 bash git xvfb fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6 xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
 && apt-mark hold ca-certificates \
 && apt-get upgrade --with-new-pkgs --yes --no-install-recommends \
 && test "$(dpkg-query --show --showformat='${Version}' ca-certificates)" = 20260816ubuntu0.24.04.1 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' libc6)" ge 2.39-0ubuntu8.9 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' libc-bin)" ge 2.39-0ubuntu8.9 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' libssl3t64)" ge 3.0.13-0ubuntu3.16 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' openssl)" ge 3.0.13-0ubuntu3.16 \
 && dpkg-query --show --showformat='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n' \
 && rm -rf /var/lib/apt/lists/* /var/cache/company-checkout-archives
COPY bootstrap.sh /opt/company/bootstrap.sh
COPY artifacts.json /opt/company/artifacts.json
COPY validate-pnpm-archive.py /opt/company/validate-pnpm-archive.py
COPY browser-policy.json /opt/company/browser-policy.json
COPY install-browser.py /opt/company/install-browser.py
RUN bash /opt/company/bootstrap.sh
COPY check-browser-policy.mjs /opt/company/check-browser-policy.mjs
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
