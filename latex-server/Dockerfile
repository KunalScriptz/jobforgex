# Self-hosted LaTeX compile server for JobForge.
# Build:  docker build -t jobforge-latex .
# Run:    docker run -p 8080:8080 jobforge-latex
FROM texlive/texlive:latest

RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json server.js ./
RUN npm install --omit=dev

ENV PORT=5959
EXPOSE 5959
CMD ["node", "server.js"]