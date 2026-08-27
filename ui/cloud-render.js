(() => {
  const API = window.RECAST_API_URL || "https://api.recast.castelmei.com";
  let currentHtml = null;
  let activeJob = null;

  const originalLoadPreview = window.loadPreview;
  window.loadPreview = function (html) {
    currentHtml = html;
    return originalLoadPreview ? originalLoadPreview(html) : undefined;
  };

  function getToken() {
    const configured = window.RECAST_API_TOKEN;
    if (configured) return configured;
    const saved = localStorage.getItem("recast.renderToken");
    if (saved) return saved;
    const token = prompt("Enter your reCast render token. It is stored only in this browser.");
    if (token) localStorage.setItem("recast.renderToken", token);
    return token;
  }

  function setBusy(busy) {
    const buttons = document.querySelectorAll("button");
    buttons.forEach(button => {
      if (button.textContent.includes("Render MP4")) button.disabled = busy;
    });
  }

  async function api(path, options = {}, token) {
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${token}`);
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `HTTP ${response.status}` }; }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  window.renderProject = async function () {
    if (activeJob) return;

    const w = Number(document.getElementById("w")?.value || 1920);
    const h = Number(document.getElementById("h")?.value || 1080);
    const fps = Number(document.getElementById("fps")?.value || 30);
    const duration = Number(document.getElementById("dur")?.value || 5);
    const format = document.getElementById("format")?.value || "MP4 / H.264";
    const html = currentHtml || document.getElementById("preview")?.srcdoc;

    if (!html) return alert("Open or create a composition first.");
    if (![w, h, fps, duration].every(Number.isFinite) || w <= 0 || h <= 0 || fps <= 0 || duration <= 0) {
      return alert("Invalid composition settings.");
    }
    if (w * h > 8294400) return alert("Maximum render resolution is 8.29 megapixels.");
    if (duration > 300) return alert("Maximum render duration is 300 seconds.");
    if (format !== "MP4 / H.264") return alert("Cloud rendering currently supports MP4 / H.264.");

    const token = getToken();
    if (!token) return alert("Cloud rendering requires a render token.");

    activeJob = "submitting";
    setBusy(true);
    status("Submitting cloud render…");
    log("Submitting render job to reCast Cloud");

    try {
      const data = await api("/v1/render", {
        method: "POST",
        body: JSON.stringify({
          html,
          config: {
            id: "studio",
            width: w,
            height: h,
            fps,
            duration,
            render: { format: "mp4" }
          }
        })
      }, token);

      activeJob = data.jobId;
      log(`Render queued: ${activeJob}`);
      await poll(activeJob, token);
    } catch (error) {
      activeJob = null;
      setBusy(false);
      status("Cloud render failed", true);
      log(`Render error: ${error?.message || error}`);
      alert(`Cloud render failed:\n${error?.message || error}`);
    }
  };

  async function poll(jobId, token) {
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const data = await api(`/v1/render/${encodeURIComponent(jobId)}`, { method: "GET" }, token);
      const progress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : 0;
      status(`Rendering… ${Math.round(progress)}%`);

      if (data.status === "failed") throw new Error(data.error || "Render failed.");
      if (data.status === "complete") {
        status("Preparing MP4…");
        log("Render complete; downloading MP4");

        const response = await fetch(`${API}/v1/render/${encodeURIComponent(jobId)}/output`, {
          method: "GET",
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          try { message = (await response.json()).error || message; } catch {}
          throw new Error(message);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `reCast-${jobId}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);

        status("Render complete");
        log("MP4 downloaded successfully");
        activeJob = null;
        setBusy(false);
        return;
      }
    }
  }
})();
