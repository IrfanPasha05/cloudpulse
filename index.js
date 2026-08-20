const express = require("express");
const os = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const START_TIME = Date.now();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ---- In-memory mock pipeline state (stands in for a real Jenkins/CloudWatch feed) ----
const pipeline = {
  stages: ["source", "build", "test", "docker", "deploy"],
  services: [
    { name: "web-app", region: "ap-south-1", instance: "t3.micro", status: "healthy" },
    { name: "api-gateway", region: "ap-south-1", instance: "t3.micro", status: "healthy" },
    { name: "worker-queue", region: "ap-south-1", instance: "t3.small", status: "healthy" },
    { name: "postgres-db", region: "ap-south-1", instance: "db.t3.micro", status: "healthy" },
  ],
  deployments: [
    { id: "d-1042", branch: "main", commit: "a91f3c2", status: "success", duration: "2m 14s", time: "08:12" },
    { id: "d-1041", branch: "main", commit: "7bd410e", status: "success", duration: "1m 58s", time: "yesterday" },
    { id: "d-1040", branch: "feature/logging", commit: "3fa22b1", status: "failed", duration: "0m 44s", time: "yesterday" },
    { id: "d-1039", branch: "main", commit: "e02c9aa", status: "success", duration: "2m 05s", time: "2 days ago" },
  ],
};

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    host: os.hostname(),
    loadAvg: os.loadavg()[0].toFixed(2),
  });
});

app.get("/api/pipeline", (_req, res) => res.json(pipeline));

app.get("/api/summary", (_req, res) => {
  const successCount = pipeline.deployments.filter((d) => d.status === "success").length;
  res.json({
    totalDeployments: pipeline.deployments.length,
    successRate: Math.round((successCount / pipeline.deployments.length) * 100),
    activeServices: pipeline.services.length,
    healthyServices: pipeline.services.filter((s) => s.status === "healthy").length,
  });
});

app.get("/healthz", (_req, res) => res.status(200).send("OK"));

app.listen(PORT, () => {
  console.log(`CloudPulse dashboard running on port ${PORT}`);
});
