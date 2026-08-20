---
title: I Built a Self-Deploying Dashboard on One EC2 Box — Here's Every Bug That Nearly Broke It
published: false
description: Building CloudPulse — a real GitHub → Jenkins → Docker → AWS EC2 pipeline that reads its own live build data, and the three real bugs that came with it.
tags: devops, aws, jenkins, docker
cover_image:
---

## The idea

I wanted one thing to be true by the end of this: **push a commit, and a live dashboard on the internet updates itself, with zero manual steps in between.**

Not a tutorial project with fake data. A real one — GitHub, Jenkins, Docker, and an actual AWS EC2 instance, wired together for real. The result is **CloudPulse**, a small Node.js dashboard that watches its own deployment pipeline and shows the real build history pulled straight from Jenkins' API.

![CloudPulse dashboard](./docs/screenshots/dashboard-hero.png)

Repo's here if you want to follow along or steal the Jenkinsfile: [github.com/IrfanPasha05/cloudpulse](https://github.com/IrfanPasha05/cloudpulse)

## The architecture

Nothing exotic — deliberately so. One `t3.micro` EC2 instance runs both Jenkins and the app itself:

```
GitHub (push to main)
   │  webhook
   ▼
Jenkins (same EC2)
   │  npm ci → npm test → docker build
   ▼
Docker container (port 3000)
   │
   ▼
Dashboard reads Jenkins + GitHub APIs live
```

Running Jenkins and the app on the same box meant I could skip a whole category of complexity — no SSH-based remote deploy, no Docker registry, no separate credentials for a remote host. Jenkins just runs `docker run` locally once the image is built. For a single-app portfolio project, that trade-off was worth it.

## Bug #1: the container that deleted itself

First full green pipeline run. Build passed, tests passed, Docker image built, container started, health check passed. I opened the browser.

**Connection refused.**

Turned out my `post` block in the Jenkinsfile ran `docker rm -f cloudpulse` unconditionally — on success *and* failure:

```groovy
post {
    always {
        sh 'docker rm -f cloudpulse'   // oops
    }
}
```

The container was healthy for about four seconds before the pipeline tore it down itself. Fix was straightforward once I saw it: only clean up on failure, and add `--restart unless-stopped` so a successful container actually stays up.

```groovy
post {
    success {
        echo 'Deployed successfully'
    }
    failure {
        sh 'docker rm -f cloudpulse || true'
    }
}
```

## Bug #2: Jenkins restarting itself mid-build

Set up a GitHub webhook so pushes trigger builds automatically — worked on the first try, which should have made me suspicious. The very next build died halfway through the Docker build stage with this buried in the log:

```
Resuming build at Thu Aug 20 22:36:51 UTC 2026 after Jenkins restart
```

Jenkins had restarted *itself*, mid-build. A `t3.micro` only has 1 GB of RAM, and running `npm ci`, a Docker build, and Jenkins' own JVM at the same time was enough to trip the kernel's OOM killer.

The fix was almost embarrassingly simple:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

2 GB of swap gave the box enough breathing room to absorb the spike instead of killing a process. Free tier constraints are a real DevOps problem, not just a demo inconvenience.

## Bug #3: 403 for my own Jenkins

Once the pipeline was reliable, I wanted the dashboard to show *real* build history instead of hardcoded demo rows — Jenkins' REST API makes this easy:

```
GET /job/CloudPulse-CI-CD/api/json?tree=builds[number,result,timestamp,duration]
```

First attempt from inside the running container: `Jenkins HTTP 403`.

The mistake was conflating "I can log into Jenkins" with "this API token has read access." Jenkins security is matrix-based here, and the user tied to the token I'd generated didn't have `Job/Read` explicitly granted — a login-capable account isn't automatically an API-capable one. Fixed by:

1. Generating a scoped API token from Jenkins' own user settings (not a login password)
2. Storing it as a Jenkins **credential** (`Secret text`), never in the repo
3. Injecting it into the container at deploy time via `withCredentials`
4. Confirming the matrix-security permissions explicitly included `Job/Read` for that user

```groovy
stage('Deploy') {
    steps {
        withCredentials([string(credentialsId: 'jenkins-api-token', variable: 'JTOKEN')]) {
            sh '''
                docker rm -f cloudpulse || true
                docker run -d --name cloudpulse -p 3000:3000 --restart unless-stopped \
                  -e JENKINS_TOKEN=$JTOKEN \
                  cloudpulse:latest
            '''
        }
    }
}
```

## What it looks like live

![Live service health](./docs/screenshots/live-service-health.png)

Real EC2 load average and memory, a real "last pushed" timestamp from GitHub's public API, and real Jenkins build numbers — not placeholders. If any of those sources go quiet, the app falls back to clearly-labeled demo data instead of crashing, which felt like the more honest failure mode than a stack trace on a dashboard.

## What's next

- Splitting Jenkins and the app onto separate hosts, with a proper registry push instead of a local `docker run`
- Putting Nginx in front for HTTPS
- A Slack ping on pipeline failure, because right now the only alert is me refreshing the browser

If you're working through your own first "real" CI/CD project — the boring infrastructure bugs (memory limits, permission scopes, a stray `always` block) are where the actual learning happens, way more than the happy path ever teaches you.

Repo: [github.com/IrfanPasha05/cloudpulse](https://github.com/IrfanPasha05/cloudpulse)
