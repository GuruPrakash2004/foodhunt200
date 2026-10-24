FROM python:3.13-slim

ARG TARGETARCH=amd64
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${TARGETARCH}.tar.gz" | tar -xz -C /usr/local/bin litestream \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY litestream.yml start.sh ./

# the data folder is the only place the app writes; the app runs as an ordinary user
RUN useradd --create-home app && mkdir /data && chown app /data && chmod +x start.sh
USER app
ENV FOODHUNT_HOSTED=1 FOODHUNT_DATA_DIR=/data FOODHUNT_DB=/data/foodhunt.db PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["./start.sh"]
