# CloudPulse

A live dashboard for an AWS deployment pipeline — tracks a commit from GitHub through Jenkins, Docker, and out to an EC2 instance, with service health and deployment history on one screen.

**Pipeline:** GitHub → Jenkins → Docker → AWS EC2

## Stack

- **App:** Node.js + Express (server-rendered API, static dashboard front end)
- **CI:** Jenkins (`Jenkinsfile`) — build, test, Docker build/push, SSH deploy to EC2
- **Secondary CI:** GitHub Actions (`.github/workflows/ci.yml`) for build/test on every PR
- **Containers:** Docker (multi-stage build) + Docker Compose for the EC2 host
- **Infra:** AWS EC2, running the container under Docker Compose with a healthcheck and log rotation

## Run locally

```bash
npm install
npm start
# → http://localhost:3000
```

## Run with Docker

```bash
docker build -t cloudpulse:latest .
docker run -p 3000:3000 cloudpulse:latest
```

Or with Compose:

```bash
docker compose up --build
```

## Jenkins pipeline

The `Jenkinsfile` defines six stages:

1. **Checkout** — pulls the branch that triggered the build
2. **Install dependencies** — `npm ci`
3. **Test** — `npm test`
4. **Docker build** — tags the image with the build number and `latest`
5. **Docker push** — pushes to Docker Hub (or swap for ECR)
6. **Deploy to EC2** — copies `docker-compose.yml` to the instance over SSH and runs `docker compose up -d`
7. **Smoke test** — polls `/healthz` on the instance until it responds

### Jenkins setup checklist

- Install the **Docker Pipeline** and **SSH Agent** plugins
- Add credentials:
  - `dockerhub-creds` — username/password (or access token) for Docker Hub
  - `ec2-ssh-key` — the EC2 instance's private key
- Update the placeholders in `Jenkinsfile`: `DOCKERHUB_NS`, `EC2_HOST`, and the smoke-test IP
- On the EC2 host: install Docker + the Compose plugin, and open port `3000` (or put it behind Nginx/ALB on 80/443)

## API

| Route            | Returns                                   |
|-------------------|--------------------------------------------|
| `GET /api/health`  | uptime, host, load average                 |
| `GET /api/pipeline` | pipeline stages, services, recent deploys |
| `GET /api/summary`  | rollup stats for the dashboard cards       |
| `GET /healthz`      | plain `200 OK` for load balancer/Compose healthchecks |

## Project structure

```
.
├── .github/workflows/ci.yml   # GitHub Actions CI
├── Dockerfile                 # multi-stage, non-root runtime
├── Jenkinsfile                # build → test → docker → deploy
├── docker-compose.yml         # how the EC2 host runs the container
├── index.js                   # Express server + API
├── public/                    # dashboard UI (HTML/CSS/JS)
├── test/                      # smoke tests
└── package.json
```
