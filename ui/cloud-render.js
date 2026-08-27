(() => {
  const API = window.RECAST_API_URL || "https://api.recast.castelmei.com";
  let currentHtml = null;

  const originalLoadPreview = window.loadPreview;
  window.loadPreview = function(html) {
    currentHtml = html;
    return originalLoadPreview ? originalLoadPreview(html) : undefined;
  };

  window.renderProject = async function() {
    const w = Number(document.getElementById("w")?.value || 1920);
    const h = Number(document.getElementById("h")?.value || 1080);
    const fps = Number(document.getElementById("fps")?.value || 30);
    const duration = Number(document.getElementById("dur")?.value || 5);
    const html = currentHtml || document.getElementById("preview")?.srcdoc;
    if (!html) return alert("Open or create a composition first.");
    if (![w, h, fps, duration].every(Number.isFinite) || w <= 0 || h <= 0 || fps <= 0 || duration <= 0) return alert("Invalid composition settings.");

    const token = window.RECAST_API_TOKEN;
    if (!token) {
      alert("Cloud rendering is not configured for this Studio yet. Use the local `recast render` command, or configure RECAST_API_TOKEN for the hosted Studio.");
      return;
    }

    status("Submitting cloud render…");
    log("Submitting render job to reCast Cloud");
    try {
      const response = await fetch(`${API}/v1/render`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ html, config: { id: "studio", width: w, height: h, fps, duration, render: { format: "mp4" } } })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      log(`Render queued: ${data.jobId}`);
      await poll(data.jobId, token);
    } catch (error) {
      status("Cloud render failed", "warn");
      log(`Error: ${error.message}`);
    }
  };

  async function poll(jobId, token) {
    for (;;) {
      await new Promise(r => setTimeout(r, 1500));
      const response = await fetch(`${API}/v1/render/${encodeURIComponent(jobId)}`, { headers: { authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      status(`Rendering… ${data.progress ?? 0}%`);
      if (data.status === "failed") throw new Error(data.error || "Render failed");
      if (data.status === "complete") {
        const output = await fetch(`${API}/v1/render/${encodeURIComponent(jobId)}/output`, { headers: { authorization: `Bearer ${token}` } });
        if (!output.ok) throw new Error(`Output download failed: HTTP ${output.status}`);
        const blob = await output.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reCast-${jobId}.mp4`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status("Render complete");
        log("MP4 downloaded");
        return;
      }
    }
  }
})();
