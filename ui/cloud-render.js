(() => {
  const API = window.RECAST_API_URL || "https://api.recast.castelmei.com";
  let currentHtml = null;
  let activeJob = null;
  let activeComposition = null;
  let selectedHandle = null;

  const originalLoadPreview = window.loadPreview;
  window.loadPreview = function (html) {
    currentHtml = html;
    return originalLoadPreview ? originalLoadPreview(html) : undefined;
  };
  function readTime() { return Number(document.getElementById("time")?.textContent?.replace(/s$/, "")); }
  function getToken() {
    const configured = window.RECAST_API_TOKEN;
    if (configured) return configured;
    const saved = localStorage.getItem("recast.renderToken");
    if (saved) return saved;
    const token = prompt("Enter your reCast render token. It is stored only in this browser.");
    if (token) localStorage.setItem("recast.renderToken", token);
    return token;
  }
  function setBusy(busy) { document.querySelectorAll("button").forEach(b => { if (b.textContent.includes("Render MP4")) b.disabled = busy; }); }
  function recordFailure(operation, error, extra = {}) {
    const entry = { operation, message: error?.message || String(error), status: error?.status ?? null, file: extra.file ?? activeComposition ?? null, at: new Date().toISOString() };
    window.__recastLastFailure = entry;
    try { log(`Failure: ${JSON.stringify(entry)}`); } catch {}
    return entry;
  }
  async function api(path, options = {}, token) {
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${token}`);
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `HTTP ${response.status}` }; }
    if (!response.ok) { const e = new Error(data.error || `HTTP ${response.status}`); e.status = response.status; e.details = data; throw e; }
    return data;
  }

  // Independent Studio agent-control compatibility surface.
  window.studio_select = async function(handle) {
    const value = String(handle ?? "").trim();
    if (!value) throw new Error("studio_select requires a non-empty element handle.");
    const frame = document.getElementById("preview");
    if (!frame) throw new Error("Preview is not mounted.");
    selectedHandle = value;
    frame.contentWindow?.postMessage({ type: "recast:select", handle: value }, "*");
    window.dispatchEvent(new CustomEvent("recast:studio-select", { detail: { handle: value } }));
    try { log(`Studio selected: ${value}`); } catch {}
    return { handle: value, selected: true };
  };
  window.studio_seek = async function(seconds) {
    const requested = Number(seconds);
    if (!Number.isFinite(requested)) throw new Error("studio_seek requires a finite time in seconds.");
    if (typeof window.seek !== "function") throw new Error("Studio seek control is unavailable.");
    const before = readTime();
    window.seek(requested);
    const landed = readTime();
    if (Number.isFinite(before) && Number.isFinite(landed) && before === landed && requested !== before) throw new Error("Preview did not accept the seek request.");
    try { log(`Studio seek: ${landed.toFixed(3)}s`); } catch {}
    return { requested, landed, selectedHandle };
  };
  window.recastStudioState = function() { return { selectedHandle, currentTime: readTime(), activeComposition, previewMounted: !!document.getElementById("preview")?.contentWindow }; };
  window.setActiveComposition = function(path) {
    const value = String(path ?? "").trim();
    activeComposition = value || null;
    window.dispatchEvent(new CustomEvent("recast:composition-change", { detail: { path: activeComposition } }));
    try { log(`Active composition: ${activeComposition || "root"}`); } catch {}
    return activeComposition;
  };

  window.renderProject = async function() {
    if (activeJob) return;
    const w = Number(document.getElementById("w")?.value || 1920), h = Number(document.getElementById("h")?.value || 1080), fps = Number(document.getElementById("fps")?.value || 30), duration = Number(document.getElementById("dur")?.value || 5), rate = Number(document.getElementById("rate")?.value || 1);
    const format = document.getElementById("format")?.value || "MP4 / H.264";
    const html = currentHtml || document.getElementById("preview")?.srcdoc;
    if (!html) return alert("Open or create a composition first.");
    if (![w,h,fps,duration,rate].every(Number.isFinite) || w<=0 || h<=0 || fps<=0 || duration<=0 || rate<=0) return alert("Invalid composition settings.");
    if (w*h > 8294400) return alert("Maximum render resolution is 8.29 megapixels.");
    if (duration > 300) return alert("Maximum render duration is 300 seconds.");
    if (format !== "MP4 / H.264") return alert("Cloud rendering currently supports MP4 / H.264.");
    const token = getToken(); if (!token) return alert("Cloud rendering requires a render token.");
    activeJob = "submitting"; setBusy(true); status("Submitting cloud render…"); log(`Submitting render job${activeComposition ? ` for ${activeComposition}` : ""}`);
    try {
      const data = await api("/v1/render", { method:"POST", body:JSON.stringify({ html, config:{ id:activeComposition || "studio", composition:activeComposition || undefined, width:w, height:h, fps, duration, playbackRate:rate, render:{format:"mp4"} } }) }, token);
      activeJob = data.jobId; log(`Render queued: ${activeJob}`); await poll(activeJob, token);
    } catch(error) { activeJob=null; setBusy(false); recordFailure("render.submit",error); status("Cloud render failed",true); alert(`Cloud render failed:\n${error?.message || error}`); }
  };
  async function poll(jobId, token) {
    for (;;) {
      await new Promise(r=>setTimeout(r,1500));
      let data; try { data=await api(`/v1/render/${encodeURIComponent(jobId)}`,{method:"GET"},token); } catch(error){ recordFailure("render.poll",error,{file:activeComposition}); throw error; }
      const progress=Number.isFinite(Number(data.progress))?Number(data.progress):0; status(`Rendering… ${Math.round(progress)}%`);
      if(data.status==="failed"){ const e=new Error(data.error||"Render failed."); e.status=data.statusCode??null; recordFailure("render.job",e,{file:activeComposition}); throw e; }
      if(data.status==="complete"){
        status("Preparing MP4…"); log("Render complete; downloading MP4");
        try {
          const response=await fetch(`${API}/v1/render/${encodeURIComponent(jobId)}/output`,{method:"GET",headers:{authorization:`Bearer ${token}`}});
          if(!response.ok){let message=`HTTP ${response.status}`;try{message=(await response.json()).error||message}catch{}const e=new Error(message);e.status=response.status;throw e;}
          const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=`reCast-${jobId}.mp4`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
          status("Render complete");log("MP4 downloaded successfully");activeJob=null;setBusy(false);return;
        } catch(error){recordFailure("render.output",error,{file:activeComposition});throw error;}
      }
    }
  }
})();
