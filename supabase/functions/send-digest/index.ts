// Sends a per-user daily digest email via Gmail SMTP. Called by pg_cron 2x/day.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMTP_USER = Deno.env.get("GMAIL_SMTP_USER")!;
const SMTP_PASS = Deno.env.get("GMAIL_SMTP_PASS")!;
const FALLBACK_RECIPIENT = Deno.env.get("DIGEST_RECIPIENT") ?? "";

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const dateIST = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

    // Fetch all workspaces (each has an owner_user_id).
    const { data: workspaces, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, name, owner_user_id");
    if (wsErr) throw wsErr;

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } },
    });

    const results: any[] = [];

    for (const ws of workspaces ?? []) {
      try {
        // Resolve owner email via auth admin.
        const { data: userRes, error: uErr } = await supabase.auth.admin.getUserById(ws.owner_user_id);
        if (uErr) throw uErr;
        const email = userRes?.user?.email ?? FALLBACK_RECIPIENT;
        if (!email) { results.push({ workspace: ws.id, skipped: "no email" }); continue; }

        const [jobsAdded, jobsApplied, jobsInterview, tailored, costs] = await Promise.all([
          supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("created_at", since),
          supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("updated_at", since).eq("status", "applied"),
          supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("updated_at", since).eq("status", "interview"),
          supabase.from("resume_versions").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("created_at", since),
          supabase.from("ai_cost_logs").select("total_cost").eq("workspace_id", ws.id).gte("created_at", since),
        ]);

        const totalCost = (costs.data ?? []).reduce((s, r: any) => s + Number(r.total_cost || 0), 0);
        const added = jobsAdded.count ?? 0;
        const applied = jobsApplied.count ?? 0;
        const interview = jobsInterview.count ?? 0;
        const resumes = tailored.count ?? 0;

        // Skip completely idle workspaces to avoid spam.
        if (added === 0 && applied === 0 && interview === 0 && resumes === 0 && totalCost === 0) {
          results.push({ workspace: ws.id, email, skipped: "no activity" });
          continue;
        }

        const rows: [string, string | number][] = [
          ["Jobs added", added],
          ["Applied", applied],
          ["Moved to interview", interview],
          ["Tailored resumes generated", resumes],
          ["Total AI cost", `$${totalCost.toFixed(4)}`],
        ];

        const html = `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
            <h2 style="margin:0 0 4px;color:#00008c">JobForge digest</h2>
            <p style="margin:0 0 20px;color:#64748b;font-size:13px">${ws.name ?? "Workspace"} · Last 12 hours · ${nowIST} IST</p>
            <table style="width:100%;border-collapse:collapse;font-size:15px">
              ${rows.map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">${k}</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#00a698">${v}</td></tr>`).join("")}
            </table>
            <p style="margin-top:24px;font-size:12px;color:#94a3b8">Automated digest from JobForge · 7 AM & 6 PM IST</p>
          </div>`;

        await client.send({
          from: `JobForge <${SMTP_USER}>`,
          to: email,
          subject: `JobForge digest — ${dateIST}`,
          content: "auto",
          html,
        });
        results.push({ workspace: ws.id, email, sent: true });
      } catch (e) {
        console.error("workspace digest failed", ws.id, e);
        results.push({ workspace: ws.id, error: String(e) });
      }
    }

    await client.close();
    return new Response(JSON.stringify({ ok: true, results }), { headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error("digest error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});