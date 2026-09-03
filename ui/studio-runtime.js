(() => {
  const API = window.RECAST_API_URL || "https://api.recast.castelmei.com";
  const $ = id => document.getElementById(id);
  let projectHtml = null;
  let currentTime = 0;
  let playing = false;
  let raf = 0;
  let scenes = [{ name: "Intro", duration: 5 }];
  let selectedScene = 0;

  const log = message => {
    const el = $("log");
    if (!el) return;
    el.innerHTML += `<br>${new Date().toLocaleTimeString()} · ${String(message).replace(/[<>]/g, "")}`;
    el.scrollTop = el.scrollHeight;
  };
  const status = (message, warning = false) => {
    if ($("status")) $("status").textContent = message;
    const dot = document.querySelector(".dot");
    if (dot) dot.style.background = warning ? "var(--warn)" : "var(--good)";
  };
  const config = () => ({
    width: Number($("w")?.value || 1920), height: Number($("h")?.value || 1080),
    fps: Number($("fps")?.value || 30), duration: Number($("dur")?.value || 5),
    playbackRate: Number($("rate")?.value || 1)
  });
  const validate = () => {
    const c = config();
    const frames = c.fps * c.duration;
    if (![c.width,c.height,c.fps,c.duration,c.playbackRate].every(Number.isFinite) || c.width <= 0 || c.height <= 0 || c.fps <= 0 || c.duration <= 0 || c.playbackRate <= 0 || !Number.isInteger(c.fps) || !Number.isInteger(frames)) {
      status("Invalid composition settings", true); log("Validation failed"); return false;
    }
    if (c.width * c.height > 8294400 || c.duration > 300) { status("Render limits exceeded", true); log("Validation failed: resource limit"); return false; }
    status(`Valid · ${frames} frames`); log(`Validated ${frames} deterministic frames`); return true;
  };
  const preview = html => {
    projectHtml = html || projectHtml || "";
    const frame = $("preview");
    if (!frame) return;
    frame.srcdoc = projectHtml;
    const empty = $("empty"); if (empty) empty.style.display = "none";
    log("Preview loaded");
  };
  const seek = seconds => {
    const c = config(); currentTime = Math.max(0, Math.min(c.duration, Number(seconds) || 0));
    const track = $("track");
    if (track) $("playhead").style.left = `${currentTime / c.duration * 100}%`;
    if ($("time")) $("time").textContent = `${currentTime.toFixed(2)}s`;
    try { $("preview")?.contentWindow.postMessage({ type: "recast:seek", time: currentTime * c.playbackRate }, "*"); } catch {}
  };
  const renderScenes = () => {
    const list = $("sceneList") || $("desktopScenes"); if (!list) return;
    list.innerHTML = scenes.map((s,i) => `<div class="scene ${i === selectedScene ? "active" : ""}" data-scene="${i}"><span>${s.name}</span><span>${Number(s.duration).toFixed(1)}s</span></div>`).join("");
    list.querySelectorAll("[data-scene]").forEach(el => el.addEventListener("click", () => { selectedScene = Number(el.dataset.scene); seek(0); renderScenes(); status(`Selected ${scenes[selectedScene].name}`); }));
    if ($("clip")) $("clip").textContent = `${scenes[selectedScene]?.name || "Intro"} · HTML composition`;
  };

  window.checkProject = validate;
  window.loadPreview = html => { preview(html); };
  window.newProject = () => { projectHtml = "<!doctype html><html><body style='margin:0;display:grid;place-items:center;height:100vh;background:#101827;color:white;font-family:system-ui'><main><h1>reCast</h1><p>HTML → deterministic video</p></main></body></html>"; scenes = [{name:"Intro",duration:config().duration || 5}]; selectedScene=0; currentTime=0; renderScenes(); preview(projectHtml); status("New composition created"); };
  window.openProject = () => {
    const input = document.createElement("input"); input.type="file"; input.accept=".html,.htm,.recast,.json";
    input.onchange = () => { const file=input.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{
      try {
        const text=String(reader.result||"");
        if(file.name.endsWith(".recast") || file.name.endsWith(".json")) { const p=JSON.parse(text); projectHtml=p.html||""; if(p.config){ for(const id of ["w","h","fps","dur","rate"]) if(p.config[id] != null && $(id)) $(id).value=p.config[id]; } scenes=Array.isArray(p.scenes)&&p.scenes.length?p.scenes:[{name:"Intro",duration:config().duration}]; selectedScene=0; }
        else projectHtml=text;
        $("projectName").textContent=file.name; currentTime=0; renderScenes(); preview(projectHtml); status(`Opened ${file.name}`);
      } catch(e){ status("Open failed",true); log(`Open error: ${e.message}`); alert(`Unable to open project: ${e.message}`); }
    }; reader.readAsText(file); };
    input.click();
  };
  window.saveProject = () => {
    const c=config(); if(!validate()) return;
    const payload={version:1,format:"reCast Project",html:projectHtml||$("preview")?.srcdoc||"",config:c,scenes,selectedScene};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=(( $("projectName")?.textContent || "reCast-project").replace(/\.[^.]+$/,""))+".recast"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); log("Project saved"); status("Project saved");
  };
  window.addScene = () => { scenes.push({name:`Scene ${scenes.length+1}`,duration:config().duration||5}); renderScenes(); status("Scene added"); log(`Added ${scenes.at(-1).name}`); };
  window.togglePlayback = () => {
    if (playing) { playing=false; cancelAnimationFrame(raf); status("Paused"); updatePlay(); return; }
    if(!validate())return; playing=true; updatePlay(); status("Playing"); let last=performance.now();
    const tick=now=>{ if(!playing)return; const delta=(now-last)/1000; last=now; seek(currentTime+delta); if(currentTime>=config().duration){playing=false;updatePlay();status("Preview complete");return;} raf=requestAnimationFrame(tick); }; raf=requestAnimationFrame(tick);
  };
  function updatePlay(){const t=playing?"❚❚ Pause":"▶ Play"; if($("playBtn"))$("playBtn").textContent=t; if($("mobilePlay"))$("mobilePlay").textContent=t;}
  window.rewind=()=>{playing=false;cancelAnimationFrame(raf);updatePlay();seek(0);status("Rewound");};
  window.timelineSeek=e=>{const r=$("track")?.getBoundingClientRect();if(!r)return;seek((Math.max(0,Math.min(r.width,e.clientX-r.left))/r.width)*config().duration);};
  const track=$("track"); if(track){ track.addEventListener("pointerdown",e=>{window.timelineSeek(e);const move=ev=>window.timelineSeek(ev),up=()=>{removeEventListener("pointermove",move);removeEventListener("pointerup",up)};addEventListener("pointermove",move);addEventListener("pointerup",up);}); }

  // Public Studio renderer: the browser never handles a secret token.
  window.renderProject = async () => {
    if(!validate()) return;
    const c=config(); const format=$("format")?.value || "MP4 / H.264";
    if(format !== "MP4 / H.264") return alert("Cloud rendering currently supports MP4 / H.264.");
    const source=projectHtml || $("preview")?.srcdoc; if(!source)return alert("Create or open a composition first.");
    const btn=$("renderBtn"); if(btn)btn.disabled=true;
    const api=async(path,options={})=>{const headers=new Headers(options.headers||{});if(options.body)headers.set("content-type","application/json");const res=await fetch(`${API}${path}`,{...options,headers});const text=await res.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={error:text};}if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;};
    try{status("Submitting render…");log("Submitting public Studio render");const job=await api("/v1/render",{method:"POST",body:JSON.stringify({html:source,config:{id:"studio",...c,render:{format:"mp4"},scenes,selectedScene}})});log(`Render queued: ${job.jobId}`);for(;;){await new Promise(r=>setTimeout(r,1200));const s=await api(`/v1/render/${encodeURIComponent(job.jobId)}`);if(s.status==="failed")throw new Error(s.error||"Render failed");status(s.status==="complete"?"Preparing MP4…":`Rendering… ${Math.round(Number(s.progress)||0)}%`);if(s.status!=="complete")continue;const response=await fetch(`${API}/v1/render/${encodeURIComponent(job.jobId)}/output`);if(!response.ok)throw new Error(`Output download failed: HTTP ${response.status}`);const blob=await response.blob();if(!blob.size)throw new Error("Renderer returned an empty MP4");const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`reCast-${job.jobId}.mp4`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status("Render complete");log(`MP4 downloaded · ${blob.size} bytes`);break;}}catch(e){status("Render failed",true);log(`Render error: ${e.message}`);alert(`Cloud render failed:\n${e.message}`);}finally{if(btn)btn.disabled=false;}
  };

  window.addEventListener("message",e=>{if(e.data?.type==="recast:seek")seek(e.data.time);});
  const initial = $("preview")?.srcdoc; if(initial) projectHtml=initial;
  renderScenes();
  if($('preview') && !$('preview').srcdoc) preview(projectHtml || "");
  status("Studio ready");
})();
