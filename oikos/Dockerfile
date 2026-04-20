FROM ghcr.io/ulsklyc/oikos:latest

# Install jq to parse /data/options.json at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

COPY run.sh /run.sh
RUN chmod +x /run.sh

ENTRYPOINT ["/run.sh"]
