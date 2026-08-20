const express = require("express");
const os = require("os");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const START_TIME = Date.now();
const JENKINS_URL = (process.env.JENKINS_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const JENKINS_JOB = process.env.JENKINS_JOB || "CloudPulse-CI-CD";
const JENKINS_USER = process.env.JENKINS_USER || "";
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || "";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function formatDuration(ms) {
  if (!ms || ms < 1000) return "0s";
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function hostMemory() {
  try {
    const text = fs.readFileSync("/proc/meminfo", "utf8");
    const values = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^(\w+):\s+(\d+)\s+kB/);
      if (m) values[m[1]] = Number(m[2]) * 1024;
    }
    const total = values.MemTotal || os.totalmem();
    const available = values.MemAvailable || os.freemem();
    return { total, used: total - available, usedPercent: Math.round(((total - available) / total) * 100) };
  } catch {
    const total = os.totalmem();
    const used = total - os.freemem();
    return { total, used, usedPercent: Math.round((used / total) * 100) };
  }
}

function ec2Data() {
  const mem = hostMemory();
  const load = os.loadavg();
  const cpuCount = os.cpus().length;
  let uptimeSeconds = 0;
  try { uptimeSeconds = Math.floor(Number(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0])); }
  catch { uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000); }

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    cpuCount,
    load1: Number(load[0].toFixed(2)),
    loadPercent: Math.min(100, Math.round((load[0] / Math.max(cpuCount, 1)) * 100)),
    memoryUsedPercent: mem.usedPercent,
    memoryUsedMb: Math.round(mem.used / 1024 / 1024),
    memoryTotalMb: Math.round(mem.total / 1024 / 1024),
    uptimeSeconds,
    uptime: formatDuration(uptimeSeconds * 1000),
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1"
  };
}

async function fetchJenkins() {
  const tree = "builds[number,result,duration,timestamp,building,url,displayName]";
  const url = `${JENKINS_URL}/job/${encodeURIComponent(JENKINS_JOB)}/api/json?tree=${encodeURIComponent(tree)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const headers = { Accept: "application/json" };
    if (JENKINS_USER && JENKINS_TOKEN) {
      headers.Authorization = `Basic ${Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString("base64")}`;
    }
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`Jenkins HTTP ${response.status}`);
    const data = await response.json();
    const builds = Array.isArray(data.builds) ? data.builds : [];
    const completed = builds.filter(b => !b.building && b.result);
    const successful = completed.filter(b => b.result === "SUCCESS");
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = completed.filter(b => b.timestamp >= weekAgo).length;
    const average = completed.length ? Math.round(completed.reduce((sum, b) => sum + (b.duration || 0), 0) / completed.length) : 0;

    return {
      connected: true,
      job: JENKINS_JOB,
      builds: builds.slice(0, 8).map(b => ({
        id: `#${b.number}`,
        number: b.number,
        branch: "main",
        commit: b.displayName || "Jenkins",
        duration: b.building ? "running" : formatDuration(b.duration),
        time: relativeTime(b.timestamp),
        status: b.building ? "building" : String(b.result || "unknown").toLowerCase(),
        building: Boolean(b.building),
        url: b.url
      })),
      summary: {
        deploymentsThisWeek: thisWeek,
        successRate: completed.length ? Math.round((successful.length / completed.length) * 100) : 0,
        averageBuildTimeSeconds: Math.round(average / 1000),
        latest: builds[0] ? {
          number: builds[0].number,
          building: Boolean(builds[0].building),
          result: builds[0].result,
          duration: builds[0].building ? "running" : formatDuration(builds[0].duration),
          url: builds[0].url
        } : null
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", ...ec2Data() }));

app.get("/api/dashboard", async (_req, res) => {
  const ec2 = ec2Data();
  let jenkins;
  try {
    jenkins = await fetchJenkins();
  } catch (error) {
    jenkins = { connected: false, error: error.name === "AbortError" ? "Jenkins request timed out" : error.message, job: JENKINS_JOB, builds: [], summary: { deploymentsThisWeek: 0, successRate: 0, averageBuildTimeSeconds: 0, latest: null } };
  }

  const services = [
    { name: "CloudPulse", region: ec2.region, instance: ec2.hostname, status: "healthy", detail: `uptime ${formatDuration((Date.now() - START_TIME))}` },
    { name: "Jenkins", region: "localhost:8080", instance: jenkins.job, status: jenkins.connected ? "healthy" : "unreachable", detail: jenkins.connected ? "API connected" : jenkins.error },
    { name: "EC2", region: ec2.region, instance: `${ec2.cpuCount} vCPU · ${ec2.memoryTotalMb} MB RAM`, status: ec2.memoryUsedPercent < 90 ? "healthy" : "warning", detail: `${ec2.memoryUsedPercent}% memory · load ${ec2.load1}` }
  ];

  res.json({ source: "live", updatedAt: new Date().toISOString(), jenkins, ec2, services });
});

app.get("/api/pipeline", async (_req, res) => {
  try {
    const jenkins = await fetchJenkins();
    res.json({ stages: ["source", "build", "test", "docker", "deploy"], deployments: jenkins.builds, services: [{ name: "CloudPulse", status: "healthy" }, { name: "Jenkins", status: "healthy" }, { name: "EC2", status: "healthy" }] });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/summary", async (_req, res) => {
  try {
    const jenkins = await fetchJenkins();
    res.json({ totalDeployments: jenkins.summary.deploymentsThisWeek, successRate: jenkins.summary.successRate, activeServices: 3, healthyServices: 3, averageBuildTimeSeconds: jenkins.summary.averageBuildTimeSeconds });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/healthz", (_req, res) => res.status(200).send("OK"));

app.listen(PORT, () => {
  console.log(`CloudPulse dashboard running on port ${PORT}`);
  console.log(`Jenkins API target: ${JENKINS_URL}/job/${JENKINS_JOB}`);
});
