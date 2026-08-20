async function loadPipeline() {
  const res = await fetch("/api/pipeline");
  const data = await res.json();

  const rows = data.deployments
    .map(
      (d) => `
      <tr>
        <td>${d.id}</td>
        <td>${d.branch}</td>
        <td>${d.commit}</td>
        <td>${d.duration}</td>
        <td>${d.time}</td>
        <td><span class="badge ${d.status}">${d.status}</span></td>
      </tr>`
    )
    .join("");
  document.getElementById("deploy-rows").innerHTML = rows;

  const cards = data.services
    .map(
      (s) => `
      <div class="service-card">
        <p class="service-name">${s.name}</p>
        <p class="service-meta">${s.region} · ${s.instance}</p>
        <div class="service-status"><span class="dot"></span> ${s.status}</div>
      </div>`
    )
    .join("");
  document.getElementById("service-grid").innerHTML = cards;

  const latest = data.deployments[0];
  document.getElementById(
    "pipeline-caption"
  ).innerHTML = `Last run <strong>${latest.id}</strong> completed in <strong>${latest.duration}</strong> — currently idle, waiting on next push to <code>${latest.branch}</code>.`;
}

function animateStats() {
  document.querySelectorAll(".stat-value").forEach((el) => {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || "";
    const duration = 900;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.floor(progress * target);
      el.textContent = value + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

loadPipeline();
animateStats();
