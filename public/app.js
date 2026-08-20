let liveData = null;

function renderDeployments(builds) {
  const rows = (builds || []).map(d => `
    <tr>
      <td>${d.url ? `<a href="${d.url}" target="_blank" rel="noreferrer">${d.id}</a>` : d.id}</td>
      <td>${d.branch}</td>
      <td>${d.commit}</td>
      <td>${d.duration}</td>
      <td>${d.time}</td>
      <td><span class="badge ${d.status}">${d.status}</span></td>
    </tr>`).join("");
  document.getElementById("deploy-rows").innerHTML = rows || `<tr><td colspan="6">No Jenkins builds available.</td></tr>`;
}

function renderServices(services) {
  document.getElementById("service-grid").innerHTML = (services || []).map(s => `
    <div class="service-card">
      <p class="service-name">${s.name}</p>
      <p class="service-meta">${s.region} · ${s.instance}</p>
      <div class="service-status"><span class="dot"></span> ${s.status}</div>
      ${s.detail ? `<p class="service-meta">${s.detail}</p>` : ""}
    </div>`).join("");
}

function setStat(selector, value, suffix = "") {
  const el = document.querySelector(selector);
  if (el) el.textContent = `${value}${suffix}`;
}

function renderDashboard(data) {
  liveData = data;
  const j = data.jenkins;
  const e = data.ec2;
  const s = j.summary;

  setStat('[data-stat="deployments"]', s.deploymentsThisWeek);
  setStat('[data-stat="success"]', s.successRate, "%");
  setStat('[data-stat="services"]', data.services.length);
  setStat('[data-stat="buildtime"]', s.averageBuildTimeSeconds, "s");

  renderDeployments(j.builds);
  renderServices(data.services);

  const latest = s.latest;
  const caption = document.getElementById("pipeline-caption");
  if (latest) {
    const state = latest.building ? "running now" : `finished ${latest.result || ""}`;
    caption.innerHTML = `Jenkins <strong>#${latest.number}</strong> is <strong>${state}</strong> — ${latest.duration}. EC2 <strong>${e.hostname}</strong> · ${e.memoryUsedPercent}% memory · load ${e.load1}.`;
  }

  const liveText = document.getElementById("live-text");
  if (liveText) {
    liveText.textContent = j.connected
      ? `LIVE · Jenkins #${latest ? latest.number : "—"} · EC2 healthy`
      : `EC2 live · Jenkins unavailable`;
  }

  document.querySelectorAll(".stage").forEach(stage => stage.classList.remove("stage-live", "stage-failed"));
  if (latest && latest.building) document.querySelector('[data-stage="build"]')?.classList.add("stage-live");
  if (latest && latest.result === "FAILURE") document.querySelector('[data-stage="build"]')?.classList.add("stage-failed");

  const updated = document.getElementById("last-updated");
  if (updated) updated.textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString()}`;
}

async function refreshDashboard() {
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderDashboard(await response.json());
  } catch (error) {
    const liveText = document.getElementById("live-text");
    if (liveText) liveText.textContent = `Dashboard data error: ${error.message}`;
  }
}

function prepareLiveStats() {
  document.querySelectorAll(".stat-value").forEach(el => {
    el.dataset.stat && (el.textContent = "—");
  });
}

prepareLiveStats();
refreshDashboard();
setInterval(refreshDashboard, 10000);
