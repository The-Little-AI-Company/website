# The action API starts the image as root. Only signed setpriv starts before the drop.
FROM docker.io/library/ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517
ENV DEBIAN_FRONTEND=noninteractive LD_PRELOAD= LD_LIBRARY_PATH= LD_AUDIT= GLIBC_TUNABLES=
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 util-linux \
 && test "$(dpkg-query --show --showformat='${Version}' ca-certificates)" = 20260816ubuntu0.24.04.1 \
 && rm -rf /var/lib/apt/lists/*
COPY capture-runtime.sh /opt/company/capture-runtime.sh
ENTRYPOINT ["/usr/bin/setpriv"]
CMD []
