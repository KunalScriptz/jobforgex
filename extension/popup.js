const $ = (id) => document.getElementById(id);

const DEFAULT_HOST = "http://localhost:5454";

chrome.storage.local.get(["host", "token"], (v) => {
  $("host").value = v.host || DEFAULT_HOST;
  $("token").value = v.token || "";
});

$("save").addEventListener("click", () => {
  const host = $("host").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  chrome.storage.local.set({ host, token }, () => {
    setStatus("Saved.", "ok");
  });
});

$("test").addEventListener("click", async () => {
  const host = $("host").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  if (!host || !token) { setStatus("Enter host and token.", "err"); return; }
  setStatus("Testing…");
  try {
    const res = await fetch(`${host}/api/public/extension/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company: "__test__", title: "__test__" }),
    });
    if (res.status === 401) setStatus("Token rejected.", "err");
    else if (res.status === 400) setStatus("Connected — token OK.", "ok");
    else if (res.ok) setStatus("Connected — test job saved.", "ok");
    else setStatus(`Unexpected ${res.status}.`, "err");
  } catch (e) {
    setStatus(e.message, "err");
  }
});

function setStatus(text, cls) {
  const el = $("status");
  el.textContent = text;
  el.className = "row " + (cls || "");
}