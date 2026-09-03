(() => {
  const $ = id => document.getElementById(id);
  const clampTime = value => { const duration = Number($("dur")?.value || 5); const t = Number(value); return Number.isFinite(t) ? Math.max(0, Math.min(duration, t)) : 0; };
  window.seek = window.seek || function(seconds) {
    const t = clampTime(seconds), duration = Number($("dur")?.value || 5);
    const playhead = $("playhead"); if (playhead) playhead.style.left = `${duration ? (t / duration) * 100 : 0}%`;
    if ($("time")) $("time").textContent = `${t.toFixed(2)}s`;
    try { $("preview")?.contentWindow?.postMessage({ type: "recast:seek", time: t * Number($("rate")?.value || 1) }, "*"); } catch {}
    return t;
  };
  let selectedHandle = null, activeComposition = null;
  window.studio_select = window.studio_select || (async handle => { const value=String(handle??"").trim(); if(!value) throw new Error("studio_select requires a non-empty element handle."); selectedHandle=value; $("preview")?.contentWindow?.postMessage({type:"recast:select",handle:value},"*"); window.dispatchEvent(new CustomEvent("recast:studio-select",{detail:{handle:value}})); return {handle:value,selected:true}; });
  window.studio_seek = window.studio_seek || (async seconds => { const requested=Number(seconds); if(!Number.isFinite(requested)) throw new Error("studio_seek requires a finite time in seconds."); const landed=window.seek(requested); return {requested,landed,selectedHandle}; });
  window.setActiveComposition = window.setActiveComposition || (path => { activeComposition=String(path??"").trim()||null; window.dispatchEvent(new CustomEvent("recast:composition-change",{detail:{path:activeComposition}})); return activeComposition; });
  window.recastStudioState = window.recastStudioState || (() => ({selectedHandle,currentTime:Number($("time")?.textContent?.replace(/s$/,""))||0,activeComposition,previewMounted:!!$("preview")?.contentWindow}));

  // Compatibility surface for live agent/source edits: when paused, rebind the current preview and
  // immediately restore the landed playhead so timed layers match the intended frame without a scrub.
  window.recastStudioApplyLiveEdit = async (html, detail = {}) => {
    const frame = $("preview");
    if (!frame) throw new Error("Studio preview is unavailable.");
    const before = Number($("time")?.textContent?.replace(/s$/,"")) || 0;
    const wasPaused = detail.paused !== false && !detail.playing;
    if (typeof window.loadPreview === "function") window.loadPreview(String(html ?? ""));
    else frame.srcdoc = String(html ?? "");
    await new Promise(resolve => frame.addEventListener("load", resolve, {once:true}));
    const landed = window.seek(before);
    frame.contentWindow?.postMessage({type:"recast:live-edit",time:landed,selectedHandle},"*");
    window.dispatchEvent(new CustomEvent("recast:live-edit",{detail:{...detail,time:landed,paused:wasPaused}}));
    return {applied:true,landed,paused:wasPaused};
  };
})();
