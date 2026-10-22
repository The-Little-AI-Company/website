# The action API starts the image as root. Only signed setpriv starts before the drop.
FROM docker.io/library/ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517
ENV DEBIAN_FRONTEND=noninteractive LD_PRELOAD= LD_LIBRARY_PATH= LD_AUDIT= GLIBC_TUNABLES=
RUN test "$(dpkg --print-architecture)" = amd64 \
 && grep --quiet --fixed-strings 'VERSION_ID="24.04"' /etc/os-release \
 && rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
 && printf '%s\n' 'Types: deb' 'URIs: http://archive.ubuntu.com/ubuntu' 'Suites: noble noble-updates' 'Components: main' 'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' '' 'Types: deb' 'URIs: http://security.ubuntu.com/ubuntu' 'Suites: noble-security' 'Components: main' 'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' > /etc/apt/sources.list.d/ubuntu.sources \
 && printf '%s\n' 'Acquire::AllowInsecureRepositories "false";' 'Acquire::AllowDowngradeToInsecureRepositories "false";' 'Acquire::Check-Valid-Until "true";' 'APT::Get::AllowUnauthenticated "false";' > /etc/apt/apt.conf.d/99company-authentication \
 && apt-get update --error-on=any \
 && mkdir -m 0755 /var/cache/company-checkout-archives \
 && apt-get -o Dir::Cache::archives=/var/cache/company-checkout-archives install --download-only --reinstall --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl util-linux \
 && test -f /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb \
 && test ! -L /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb \
 && test "$(stat -c %s /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb)" = 138884 \
 && printf '%s  %s\n' 8a0a754aaafed72cc8efb8c1731808133284a84fbfc76a4fcc73fce9e01b4187 /var/cache/company-checkout-archives/ca-certificates_20260816ubuntu0.24.04.1_all.deb | sha256sum --check --strict --status \
 && apt-get -o Dir::Cache::archives=/var/cache/company-checkout-archives install --no-download --reinstall --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl util-linux \
 && apt-mark hold ca-certificates \
 && apt-get upgrade --with-new-pkgs --yes --no-install-recommends \
 && test "$(dpkg-query --show --showformat='${Version}' ca-certificates)" = 20260816ubuntu0.24.04.1 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' libc6)" ge 2.39-0ubuntu8.9 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' libc-bin)" ge 2.39-0ubuntu8.9 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' libssl3t64)" ge 3.0.13-0ubuntu3.16 \
 && dpkg --compare-versions "$(dpkg-query --show --showformat='${Version}' openssl)" ge 3.0.13-0ubuntu3.16 \
 && dpkg-query --show --showformat='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n' \
 && rm -rf /var/lib/apt/lists/* /var/cache/company-checkout-archives
COPY capture-runtime.sh /opt/company/capture-runtime.sh
ENTRYPOINT ["/usr/bin/setpriv"]
CMD []
