FROM ghcr.io/ulsklyc/oikos:latest

# Install jq to parse /data/options.json at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

COPY run.sh /run.sh
RUN chmod +x /run.sh

# Override setup.js with the version that supports --username/--password CLI args
COPY setup.js /app/setup.js

ENTRYPOINT ["/run.sh"]
