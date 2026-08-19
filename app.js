// =========================================================
// APP.JS — Lógica principal de Copa 151 UABCS
// =========================================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado en memoria de la sesión actual
let currentUser = null;   // objeto de auth
let currentProfile = null; // fila de public.profiles
let activeTournament = null; // torneo activo (el primero is_active = true)
let currentMyTeam = null; // equipo del jugador para el torneo activo

// =========================================================
// UTILIDADES DE UI
// =========================================================
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
  window.scrollTo(0, 0);
  applyAreaBackground(id);
}

// =========================================================
// FONDO DINÁMICO POR ÁREA
// Cada vista tiene un tono de fondo propio; el cambio de color
// es gradual gracias a la transición definida en CSS (body).
// =========================================================
const AREA_BACKGROUNDS = {
  "view-home": "#c7d6a8",
  "view-register": "#bcd8dd",
  "view-login": "#bcd8dd",
  "view-dashboard": "#d7e0b8",
  "view-register-team": "#d9d2ec",
  "view-my-team": "#d9d2ec",
  "view-liga": "#f5dfa8",
  "view-host": "#e9c3c0",
  "view-admin": "#c3d2e9"
};

function applyAreaBackground(viewId) {
  const color = AREA_BACKGROUNDS[viewId] || AREA_BACKGROUNDS["view-home"];
  document.body.style.backgroundColor = color;
}

// =========================================================
// EFECTO DE SONIDO ESTILO VIDEOJUEGO ("blip" de menú)
// Generado con Web Audio API — sin archivos de audio con
// copyright. Suena al presionar botones y enlaces del menú.
// =========================================================
let sfxContext = null;
function playMenuBlip() {
  try {
    if (!sfxContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      sfxContext = new AudioCtx();
    }
    if (sfxContext.state === "suspended") sfxContext.resume();

    const osc = sfxContext.createOscillator();
    const gain = sfxContext.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, sfxContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, sfxContext.currentTime + 0.05);
    gain.gain.setValueAtTime(0.12, sfxContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, sfxContext.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(sfxContext.destination);
    osc.start();
    osc.stop(sfxContext.currentTime + 0.1);
  } catch (e) {
    // Si el navegador bloquea audio, simplemente no suena; no afecta la app.
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("button, .btn, .nav-link, .filter-btn, .link-btn");
  if (el) playMenuBlip();
}, true);

function showGlobalMessage(text, type) {
  const box = document.getElementById("global-message");
  box.textContent = text;
  box.className = "global-message " + (type || "");
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 6000);
}

function friendlyError(err) {
  const msg = (err && err.message) ? err.message : String(err || "");
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/user already registered/i.test(msg)) return "Ese correo ya está registrado.";
  if (/duplicate key value/i.test(msg) && /username/i.test(msg)) return "Ese nombre de usuario ya está en uso.";
  if (/row-level security/i.test(msg) || /permission denied/i.test(msg)) return "No tienes permisos para realizar esta acción.";
  if (/network/i.test(msg)) return "Problema de conexión. Inténtalo nuevamente.";
  return "No se pudo completar la acción. Inténtalo nuevamente.";
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function fmtTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

// =========================================================
// NAV BAR
// =========================================================
function refreshNavUserArea() {
  const area = document.getElementById("nav-user-area");
  if (currentProfile) {
    area.textContent = `${currentProfile.username} (${currentProfile.role})`;
  } else {
    area.textContent = "";
  }
}

// =========================================================
// SESIÓN / AUTH
// =========================================================
async function loadSessionAndProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    currentUser = null;
    currentProfile = null;
    refreshNavUserArea();
    return false;
  }
  currentUser = session.user;
  const { data: profile, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();
  if (error) {
    console.error(error);
    currentProfile = null;
    return false;
  }
  currentProfile = profile;
  refreshNavUserArea();
  return true;
}

async function loadActiveTournament() {
  const { data, error } = await sb
    .from("tournaments")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!error) activeTournament = data;
}

async function requireAuthOrRedirect() {
  const ok = await loadSessionAndProfile();
  if (!ok) {
    showGlobalMessage("Debes iniciar sesión para continuar.", "error");
    showView("view-login");
    return false;
  }
  return true;
}

// =========================================================
// INICIO / NAVEGACIÓN BÁSICA
// =========================================================
document.getElementById("btn-go-home").addEventListener("click", () => showView("view-home"));
document.getElementById("btn-home-login").addEventListener("click", () => showView("view-login"));
document.getElementById("btn-home-register").addEventListener("click", () => showView("view-register"));
document.getElementById("btn-home-liga").addEventListener("click", () => openLiga());
document.getElementById("nav-liga").addEventListener("click", () => openLiga());
document.getElementById("link-to-login").addEventListener("click", () => showView("view-login"));
document.getElementById("link-to-register").addEventListener?.("click", () => showView("view-register"));
document.getElementById("link-to-register")?.addEventListener("click", () => showView("view-register"));

// =========================================================
// REGISTRO
// =========================================================
document.getElementById("form-register").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("register-error");
  errBox.classList.add("hidden");

  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  if (username.length < 3) {
    errBox.textContent = "El usuario debe tener al menos 3 caracteres.";
    errBox.classList.remove("hidden");
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });

  if (error) {
    errBox.textContent = friendlyError(error);
    errBox.classList.remove("hidden");
    return;
  }

  // Si la confirmación de correo está activada, puede no haber sesión inmediata.
  if (!data.session) {
    showGlobalMessage("Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión.", "success");
    showView("view-login");
    return;
  }

  await postLoginRedirect();
});

// =========================================================
// LOGIN
// =========================================================
document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("login-error");
  errBox.classList.add("hidden");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errBox.textContent = friendlyError(error);
    errBox.classList.remove("hidden");
    return;
  }
  await postLoginRedirect();
});

async function postLoginRedirect() {
  await loadSessionAndProfile();
  await loadActiveTournament();
  await openDashboard();
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  refreshNavUserArea();
  showView("view-home");
});

// =========================================================
// PANEL DEL JUGADOR
// =========================================================
async function openDashboard() {
  if (!(await requireAuthOrRedirect())) return;
  if (!activeTournament) await loadActiveTournament();

  document.getElementById("dash-username").textContent = currentProfile.username;
  document.getElementById("dash-points").textContent = currentProfile.academy_points;

  // Estado del equipo del torneo activo
  currentMyTeam = null;
  if (activeTournament) {
    const { data: team } = await sb
      .from("teams")
      .select("*")
      .eq("user_id", currentProfile.id)
      .eq("tournament_id", activeTournament.id)
      .maybeSingle();
    currentMyTeam = team || null;
  }

  document.getElementById("dash-inscripcion").textContent = currentMyTeam ? "Inscrito" : "Sin inscribir";
  document.getElementById("dash-team-status").textContent = currentMyTeam
    ? statusLabel(currentMyTeam.status)
    : "Sin equipo registrado";

  // Próximo combate
  const nextMatchBox = document.getElementById("dash-next-match");
  const nextMatchText = document.getElementById("dash-next-match-text");
  if (activeTournament) {
    const { data: matches } = await sb
      .from("matches")
      .select("*, p1:player1_id(username), p2:player2_id(username)")
      .eq("tournament_id", activeTournament.id)
      .or(`player1_id.eq.${currentProfile.id},player2_id.eq.${currentProfile.id}`)
      .neq("status", "finalizado")
      .order("round", { ascending: true })
      .limit(1);
    if (matches && matches.length > 0) {
      const m = matches[0];
      nextMatchText.textContent = `Ronda ${m.round}: ${m.p1?.username || "?"} vs ${m.p2?.username || "?"} — ${fmtDate(m.match_date)} ${fmtTime(m.match_time)} (${m.status})`;
      nextMatchBox.classList.remove("hidden");
    } else {
      nextMatchBox.classList.add("hidden");
    }
  }

  // Botones de rol
  document.getElementById("btn-goto-host").style.display =
    (currentProfile.role === "host" || currentProfile.role === "admin") ? "inline-block" : "none";
  document.getElementById("btn-goto-admin").style.display =
    (currentProfile.role === "admin") ? "inline-block" : "none";

  showView("view-dashboard");
}

function statusLabel(status) {
  if (status === "pending") return "PENDIENTE";
  if (status === "approved") return "APROBADO";
  if (status === "invalid") return "INVÁLIDO";
  return status;
}

document.getElementById("btn-goto-register-team").addEventListener("click", () => {
  document.getElementById("team-raw-input").value = currentMyTeam ? currentMyTeam.raw_text : "";
  document.getElementById("team-errors").classList.add("hidden");
  showView("view-register-team");
});
document.getElementById("btn-goto-my-team").addEventListener("click", openMyTeam);
document.getElementById("btn-goto-liga-from-dash").addEventListener("click", () => openLiga());
document.getElementById("btn-goto-host").addEventListener("click", () => openHostPanel());
document.getElementById("btn-goto-admin").addEventListener("click", () => openAdminPanel());
document.getElementById("btn-cancel-team").addEventListener("click", () => openDashboard());
document.getElementById("btn-back-from-my-team").addEventListener("click", () => openDashboard());

// =========================================================
// REGISTRAR / CORREGIR EQUIPO
// =========================================================
document.getElementById("btn-submit-team").addEventListener("click", async () => {
  const errBox = document.getElementById("team-errors");
  errBox.classList.add("hidden");
  errBox.textContent = "";

  const rawText = document.getElementById("team-raw-input").value.trim();
  if (!rawText) {
    errBox.textContent = "Debes pegar el texto de tu equipo.";
    errBox.classList.remove("hidden");
    return;
  }

  const pokemons = parseShowdownText(rawText);
  const result = validateTeam(pokemons);

  if (!result.valid) {
    errBox.textContent = result.errors.join("\n");
    errBox.classList.remove("hidden");
    return;
  }

  if (!activeTournament) {
    errBox.textContent = "No hay un torneo activo en este momento.";
    errBox.classList.remove("hidden");
    return;
  }

  try {
    // Si ya existe un equipo (por ejemplo, marcado inválido), guardamos la versión anterior
    if (currentMyTeam) {
      await sb.from("team_versions").insert({
        team_id: currentMyTeam.id,
        raw_text: currentMyTeam.raw_text,
        pokemons: currentMyTeam.pokemons,
        status_at_save: currentMyTeam.status
      });

      const { error: updErr } = await sb
        .from("teams")
        .update({
          raw_text: rawText,
          pokemons: pokemons,
          status: "pending",
          updated_at: new Date().toISOString()
        })
        .eq("id", currentMyTeam.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await sb.from("teams").insert({
        user_id: currentProfile.id,
        tournament_id: activeTournament.id,
        raw_text: rawText,
        pokemons: pokemons,
        status: "pending"
      });
      if (insErr) throw insErr;
    }

    showGlobalMessage("Equipo guardado. Tu equipo está esperando revisión.", "success");
    await openDashboard();
  } catch (err) {
    console.error(err);
    errBox.textContent = "No se pudo guardar el equipo. Inténtalo nuevamente.";
    errBox.classList.remove("hidden");
  }
});

// =========================================================
// VER MI EQUIPO
// =========================================================
async function openMyTeam() {
  if (!activeTournament) await loadActiveTournament();

  const { data: team } = await sb
    .from("teams")
    .select("*")
    .eq("user_id", currentProfile.id)
    .eq("tournament_id", activeTournament.id)
    .maybeSingle();

  currentMyTeam = team || null;

  const banner = document.getElementById("my-team-status-banner");
  const reasonBox = document.getElementById("my-team-reason");
  const reasonText = document.getElementById("my-team-reason-text");
  const list = document.getElementById("my-team-list");
  list.innerHTML = "";

  if (!currentMyTeam) {
    banner.className = "status-banner pending";
    banner.textContent = "Aún no has registrado un equipo para este torneo.";
    reasonBox.classList.add("hidden");
    showView("view-my-team");
    return;
  }

  if (currentMyTeam.status === "pending") {
    banner.className = "status-banner pending";
    banner.textContent = "Tu equipo está esperando revisión.";
    reasonBox.classList.add("hidden");
  } else if (currentMyTeam.status === "approved") {
    banner.className = "status-banner approved";
    banner.textContent = "✓ Equipo aprobado. Estás listo para competir.";
    reasonBox.classList.add("hidden");
  } else {
    banner.className = "status-banner invalid";
    banner.textContent = "✕ Equipo inválido.";
    const { data: reviews } = await sb
      .from("team_reviews")
      .select("*")
      .eq("team_id", currentMyTeam.id)
      .order("created_at", { ascending: false })
      .limit(1);
    reasonText.textContent = (reviews && reviews[0] && reviews[0].reason) || "Sin motivo especificado.";
    reasonBox.classList.remove("hidden");
  }

  renderPokeList(list, currentMyTeam.pokemons);
  showView("view-my-team");
}

function renderPokeList(container, pokemons) {
  container.innerHTML = "";
  (pokemons || []).forEach(p => {
    const div = document.createElement("div");
    div.className = "poke-card";
    div.innerHTML = `
      <b>${escapeHtml(p.species || "?")}</b>
      <div class="poke-meta">
        Objeto: ${escapeHtml(p.item || "-")} · Habilidad: ${escapeHtml(p.ability || "-")} · Naturaleza: ${escapeHtml(p.nature || "-")}<br/>
        EVs: ${escapeHtml(p.evs || "-")} ${p.ivs ? " · IVs: " + escapeHtml(p.ivs) : ""}
      </div>
      <ul>${(p.moves || []).map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
    `;
    container.appendChild(div);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

document.getElementById("btn-fix-team").addEventListener("click", () => {
  document.getElementById("team-raw-input").value = currentMyTeam ? currentMyTeam.raw_text : "";
  document.getElementById("team-errors").classList.add("hidden");
  showView("view-register-team");
});

// =========================================================
// LIGA (pública)
// =========================================================
async function openLiga() {
  if (!activeTournament) await loadActiveTournament();

  if (activeTournament) {
    document.getElementById("liga-tournament-name").textContent = activeTournament.name;
    document.getElementById("liga-date").textContent = fmtDate(activeTournament.event_date);
    document.getElementById("liga-time").textContent = fmtTime(activeTournament.event_time);
    document.getElementById("liga-location").textContent = activeTournament.location;
  }

  // Clasificación
  const { data: players } = await sb
    .from("profiles")
    .select("username, academy_points, wins, losses")
    .order("academy_points", { ascending: false })
    .limit(100);

  const tbody = document.getElementById("liga-table-body");
  tbody.innerHTML = "";
  (players || []).forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(p.username)}</td><td>${p.academy_points}</td><td>${p.wins}</td><td>${p.losses}</td>`;
    tbody.appendChild(tr);
  });

  // Combates
  const matchesBody = document.getElementById("liga-matches-body");
  matchesBody.innerHTML = "";
  if (activeTournament) {
    const { data: matches } = await sb
      .from("matches")
      .select("*, p1:player1_id(username), p2:player2_id(username), winner:winner_id(username)")
      .eq("tournament_id", activeTournament.id)
      .order("round", { ascending: true });

    (matches || []).forEach(m => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(m.p1?.username || "?")}</td>
        <td>${escapeHtml(m.p2?.username || "?")}</td>
        <td>${m.round}</td>
        <td>${fmtDate(m.match_date)}</td>
        <td>${fmtTime(m.match_time)}</td>
        <td>${m.status}</td>
        <td>${m.winner ? escapeHtml(m.winner.username) : "-"}</td>
      `;
      matchesBody.appendChild(tr);
    });

    // Próximo combate del usuario logueado (si aplica)
    const nextBox = document.getElementById("liga-next-match");
    if (currentProfile) {
      const mine = (matches || []).find(m =>
        (m.player1_id === currentProfile.id || m.player2_id === currentProfile.id) && m.status !== "finalizado"
      );
      if (mine) {
        nextBox.textContent = `Tu próximo combate: Ronda ${mine.round} vs ${
          mine.player1_id === currentProfile.id ? mine.p2?.username : mine.p1?.username
        } — ${fmtDate(mine.match_date)} ${fmtTime(mine.match_time)}`;
        nextBox.classList.remove("hidden");
      } else {
        nextBox.classList.add("hidden");
      }
    } else {
      nextBox.classList.add("hidden");
    }
  }

  showView("view-liga");
}

document.getElementById("btn-liga-back").addEventListener("click", () => {
  if (currentProfile) openDashboard(); else showView("view-home");
});

// =========================================================
// PANEL DE HOST
// =========================================================
let hostFilter = "all";
let hostSearchTerm = "";
let hostTeamsCache = [];

async function openHostPanel() {
  if (!(await requireAuthOrRedirect())) return;
  if (currentProfile.role !== "host" && currentProfile.role !== "admin") {
    showGlobalMessage("No tienes permisos para acceder a esta sección.", "error");
    await openDashboard();
    return;
  }
  await loadActiveTournament();
  await refreshHostTeams();
  showView("view-host");
}

async function refreshHostTeams() {
  if (!activeTournament) return;
  const { data, error } = await sb
    .from("teams")
    .select("*, player:user_id(username)")
    .eq("tournament_id", activeTournament.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(error);
    showGlobalMessage(friendlyError(error), "error");
    return;
  }
  hostTeamsCache = data || [];
  renderHostCounts();
  renderHostTeamList();
}

function renderHostCounts() {
  document.getElementById("host-count-pending").textContent = hostTeamsCache.filter(t => t.status === "pending").length;
  document.getElementById("host-count-approved").textContent = hostTeamsCache.filter(t => t.status === "approved").length;
  document.getElementById("host-count-invalid").textContent = hostTeamsCache.filter(t => t.status === "invalid").length;
}

function renderHostTeamList() {
  const container = document.getElementById("host-team-list");
  container.innerHTML = "";

  let list = hostTeamsCache;
  if (hostFilter !== "all") list = list.filter(t => t.status === hostFilter);
  if (hostSearchTerm) {
    const term = hostSearchTerm.toLowerCase();
    list = list.filter(t => (t.player?.username || "").toLowerCase().includes(term));
  }

  if (list.length === 0) {
    container.innerHTML = `<p class="hint">No hay equipos que coincidan con el filtro.</p>`;
    return;
  }

  list.forEach(team => {
    const div = document.createElement("div");
    div.className = "host-team-card";
    const pokeNames = (team.pokemons || []).map(p => p.species).join(", ");
    div.innerHTML = `
      <div class="htc-header">
        <strong>Equipo de: ${escapeHtml(team.player?.username || "?")}</strong>
        <span class="badge ${team.status}">${statusLabel(team.status)}</span>
      </div>
      <div class="htc-pokelist">${escapeHtml(pokeNames)}</div>
      <div class="htc-actions">
        <button class="btn btn-ghost" data-action="view" data-id="${team.id}">VER EQUIPO COMPLETO</button>
        <button class="btn btn-primary" data-action="approve" data-id="${team.id}">✓ APROBAR</button>
        <button class="btn btn-danger" data-action="invalid" data-id="${team.id}">✕ MARCAR INVÁLIDO</button>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      const team = hostTeamsCache.find(t => t.id === id);
      if (!team) return;
      if (action === "view") openTeamDetailModal(team);
      if (action === "approve") approveTeam(team);
      if (action === "invalid") openInvalidReasonModal(team);
    });
  });
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    hostFilter = btn.getAttribute("data-filter");
    renderHostTeamList();
  });
});

document.getElementById("host-search").addEventListener("input", (e) => {
  hostSearchTerm = e.target.value.trim();
  renderHostTeamList();
});

document.getElementById("btn-host-back").addEventListener("click", () => openDashboard());

function openTeamDetailModal(team) {
  document.getElementById("modal-raw-text").textContent = team.raw_text;
  renderPokeList(document.getElementById("modal-team-list"), team.pokemons);
  openModal("modal-team-detail");
}
document.getElementById("modal-close-btn").addEventListener("click", () => closeModal("modal-team-detail"));

async function approveTeam(team) {
  try {
    const { error: updErr } = await sb
      .from("teams")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", team.id);
    if (updErr) throw updErr;

    const { error: revErr } = await sb.from("team_reviews").insert({
      team_id: team.id,
      reviewer_id: currentProfile.id,
      status: "approved",
      reason: null
    });
    if (revErr) throw revErr;

    showGlobalMessage("Equipo aprobado.", "success");
    await refreshHostTeams();
  } catch (err) {
    console.error(err);
    showGlobalMessage(friendlyError(err), "error");
  }
}

let pendingInvalidTeam = null;
function openInvalidReasonModal(team) {
  pendingInvalidTeam = team;
  document.getElementById("invalid-reason-text").value = "";
  document.getElementById("invalid-reason-error").classList.add("hidden");
  openModal("modal-invalid-reason");
}
document.getElementById("modal-reason-close-btn").addEventListener("click", () => closeModal("modal-invalid-reason"));

document.getElementById("btn-confirm-invalid").addEventListener("click", async () => {
  const errBox = document.getElementById("invalid-reason-error");
  const reason = document.getElementById("invalid-reason-text").value.trim();
  if (!reason) {
    errBox.textContent = "Debes escribir un motivo para marcar el equipo como inválido.";
    errBox.classList.remove("hidden");
    return;
  }
  try {
    const { error: updErr } = await sb
      .from("teams")
      .update({ status: "invalid", updated_at: new Date().toISOString() })
      .eq("id", pendingInvalidTeam.id);
    if (updErr) throw updErr;

    const { error: revErr } = await sb.from("team_reviews").insert({
      team_id: pendingInvalidTeam.id,
      reviewer_id: currentProfile.id,
      status: "invalid",
      reason: reason
    });
    if (revErr) throw revErr;

    closeModal("modal-invalid-reason");
    showGlobalMessage("Equipo marcado como inválido.", "success");
    await refreshHostTeams();
  } catch (err) {
    console.error(err);
    errBox.textContent = friendlyError(err);
    errBox.classList.remove("hidden");
  }
});

// =========================================================
// PANEL DE ADMINISTRADOR
// =========================================================
async function openAdminPanel() {
  if (!(await requireAuthOrRedirect())) return;
  if (currentProfile.role !== "admin") {
    showGlobalMessage("No tienes permisos para acceder a esta sección.", "error");
    await openDashboard();
    return;
  }
  await refreshAdminUsers();
  await refreshAdminTournaments();
  await refreshAdminMatches();
  showView("view-admin");
}

document.getElementById("btn-admin-back").addEventListener("click", () => openDashboard());
document.getElementById("btn-admin-goto-host").addEventListener("click", () => openHostPanel());

// ---- Usuarios ----
let adminUsersCache = [];
async function refreshAdminUsers() {
  const { data, error } = await sb.from("profiles").select("*").order("username", { ascending: true });
  if (error) { showGlobalMessage(friendlyError(error), "error"); return; }
  adminUsersCache = data || [];
  renderAdminUsers();
  populateMatchPlayerSelects();
}

function renderAdminUsers() {
  const container = document.getElementById("admin-user-list");
  const term = document.getElementById("admin-user-search").value.trim().toLowerCase();
  container.innerHTML = "";
  adminUsersCache
    .filter(u => u.username.toLowerCase().includes(term))
    .forEach(u => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <span><strong>${escapeHtml(u.username)}</strong> — rol: ${u.role} — puntos: ${u.academy_points}</span>
        <button class="btn btn-ghost" data-id="${u.id}">Editar</button>
      `;
      row.querySelector("button").addEventListener("click", () => openUserRoleModal(u));
      container.appendChild(row);
    });
}
document.getElementById("admin-user-search").addEventListener("input", renderAdminUsers);

let pendingUserEdit = null;
function openUserRoleModal(user) {
  pendingUserEdit = user;
  document.getElementById("modal-role-username").textContent = user.username;
  document.getElementById("modal-role-select").value = user.role;
  document.getElementById("modal-points-adjust").value = 0;
  openModal("modal-user-role");
}
document.getElementById("modal-role-close-btn").addEventListener("click", () => closeModal("modal-user-role"));

document.getElementById("btn-save-user-role").addEventListener("click", async () => {
  const newRole = document.getElementById("modal-role-select").value;
  const pointsAdjust = parseInt(document.getElementById("modal-points-adjust").value || "0", 10);

  try {
    if (newRole !== pendingUserEdit.role) {
      const { error } = await sb.from("profiles").update({ role: newRole }).eq("id", pendingUserEdit.id);
      if (error) throw error;
    }
    if (pointsAdjust && !isNaN(pointsAdjust) && pointsAdjust !== 0) {
      const { error } = await sb.from("points").insert({
        user_id: pendingUserEdit.id,
        tournament_id: activeTournament ? activeTournament.id : null,
        amount: pointsAdjust,
        reason: "Ajuste manual del administrador",
        created_by: currentProfile.id
      });
      if (error) throw error;
    }
    closeModal("modal-user-role");
    showGlobalMessage("Usuario actualizado.", "success");
    await refreshAdminUsers();
  } catch (err) {
    console.error(err);
    showGlobalMessage(friendlyError(err), "error");
  }
});

// ---- Torneos ----
let adminTournamentsCache = [];
async function refreshAdminTournaments() {
  const { data, error } = await sb.from("tournaments").select("*").order("created_at", { ascending: false });
  if (error) { showGlobalMessage(friendlyError(error), "error"); return; }
  adminTournamentsCache = data || [];
  const container = document.getElementById("admin-tournament-list");
  container.innerHTML = "";
  adminTournamentsCache.forEach(t => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <span><strong>${escapeHtml(t.name)}</strong> — ${fmtDate(t.event_date)} ${fmtTime(t.event_time)} — ${escapeHtml(t.location)} ${t.is_active ? "· <em>activo</em>" : ""}</span>
      <button class="btn btn-ghost" data-id="${t.id}">${t.is_active ? "Desactivar" : "Activar"}</button>
    `;
    row.querySelector("button").addEventListener("click", async () => {
      try {
        if (!t.is_active) {
          // Desactivar los demás para mantener un solo torneo activo a la vez
          await sb.from("tournaments").update({ is_active: false }).neq("id", t.id);
          await sb.from("tournaments").update({ is_active: true }).eq("id", t.id);
        } else {
          await sb.from("tournaments").update({ is_active: false }).eq("id", t.id);
        }
        showGlobalMessage("Torneo actualizado.", "success");
        await refreshAdminTournaments();
        await loadActiveTournament();
      } catch (err) {
        showGlobalMessage(friendlyError(err), "error");
      }
    });
    container.appendChild(row);
  });
  populateMatchTournamentSelect();
}

document.getElementById("form-new-tournament").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("tourn-name").value.trim();
  const date = document.getElementById("tourn-date").value;
  const time = document.getElementById("tourn-time").value;
  const location = document.getElementById("tourn-location").value.trim();
  const format = document.getElementById("tourn-format").value.trim();

  try {
    const { error } = await sb.from("tournaments").insert({
      name, event_date: date, event_time: time, location, format, is_active: false
    });
    if (error) throw error;
    e.target.reset();
    document.getElementById("tourn-format").value = "Dobles 4 vs 4";
    showGlobalMessage("Torneo creado.", "success");
    await refreshAdminTournaments();
  } catch (err) {
    showGlobalMessage(friendlyError(err), "error");
  }
});

// ---- Combates ----
function populateMatchTournamentSelect() {
  const sel = document.getElementById("match-tournament");
  sel.innerHTML = adminTournamentsCache.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
}
function populateMatchPlayerSelects() {
  const opts = adminUsersCache.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join("");
  document.getElementById("match-player1").innerHTML = opts;
  document.getElementById("match-player2").innerHTML = opts;
}

async function refreshAdminMatches() {
  if (adminTournamentsCache.length === 0) await refreshAdminTournaments();
  const tournamentId = document.getElementById("match-tournament").value || (activeTournament && activeTournament.id);
  if (!tournamentId) return;

  const { data, error } = await sb
    .from("matches")
    .select("*, p1:player1_id(username), p2:player2_id(username), winner:winner_id(username)")
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true });
  if (error) { showGlobalMessage(friendlyError(error), "error"); return; }

  const container = document.getElementById("admin-match-list");
  container.innerHTML = "";
  (data || []).forEach(m => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <span>Ronda ${m.round}: ${escapeHtml(m.p1?.username || "?")} vs ${escapeHtml(m.p2?.username || "?")} — ${m.status} ${m.winner ? "— ganador: " + escapeHtml(m.winner.username) : ""}</span>
      <button class="btn btn-ghost" data-id="${m.id}">Registrar ganador</button>
    `;
    row.querySelector("button").addEventListener("click", () => openMatchWinnerModal(m));
    container.appendChild(row);
  });
}

document.getElementById("form-new-match").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tournament_id = document.getElementById("match-tournament").value;
  const player1_id = document.getElementById("match-player1").value;
  const player2_id = document.getElementById("match-player2").value;
  const round = parseInt(document.getElementById("match-round").value, 10);
  const match_date = document.getElementById("match-date").value || null;
  const match_time = document.getElementById("match-time").value || null;

  if (player1_id === player2_id) {
    showGlobalMessage("Selecciona dos jugadores diferentes.", "error");
    return;
  }

  try {
    const { error } = await sb.from("matches").insert({
      tournament_id, player1_id, player2_id, round, match_date, match_time, status: "pending"
    });
    if (error) throw error;
    showGlobalMessage("Combate creado.", "success");
    await refreshAdminMatches();
  } catch (err) {
    showGlobalMessage(friendlyError(err), "error");
  }
});

let pendingMatchEdit = null;
function openMatchWinnerModal(match) {
  pendingMatchEdit = match;
  const sel = document.getElementById("modal-winner-select");
  sel.innerHTML = `
    <option value="${match.player1_id}">${escapeHtml(match.p1?.username || "Jugador 1")}</option>
    <option value="${match.player2_id}">${escapeHtml(match.p2?.username || "Jugador 2")}</option>
  `;
  openModal("modal-match-winner");
}
document.getElementById("modal-winner-close-btn").addEventListener("click", () => closeModal("modal-match-winner"));

document.getElementById("btn-save-match-winner").addEventListener("click", async () => {
  const winnerId = document.getElementById("modal-winner-select").value;
  const loserId = winnerId === pendingMatchEdit.player1_id ? pendingMatchEdit.player2_id : pendingMatchEdit.player1_id;

  try {
    const { error: matchErr } = await sb
      .from("matches")
      .update({ status: "finalizado", winner_id: winnerId })
      .eq("id", pendingMatchEdit.id);
    if (matchErr) throw matchErr;

    // Puntos: victoria +25, derrota +0
    await sb.from("points").insert({
      user_id: winnerId,
      tournament_id: pendingMatchEdit.tournament_id,
      amount: 25,
      reason: "Victoria en combate",
      created_by: currentProfile.id
    });

    // Actualizar contadores de victorias/derrotas
    const winnerProfile = adminUsersCache.find(u => u.id === winnerId);
    const loserProfile = adminUsersCache.find(u => u.id === loserId);
    if (winnerProfile) {
      await sb.from("profiles").update({ wins: (winnerProfile.wins || 0) + 1 }).eq("id", winnerId);
    }
    if (loserProfile) {
      await sb.from("profiles").update({ losses: (loserProfile.losses || 0) + 1 }).eq("id", loserId);
    }

    closeModal("modal-match-winner");
    showGlobalMessage("Resultado registrado y puntos actualizados.", "success");
    await refreshAdminUsers();
    await refreshAdminMatches();
  } catch (err) {
    console.error(err);
    showGlobalMessage(friendlyError(err), "error");
  }
});

document.getElementById("match-tournament").addEventListener?.("change", refreshAdminMatches);

// =========================================================
// INICIALIZACIÓN
// =========================================================
(async function init() {
  await loadActiveTournament();
  const hasSession = await loadSessionAndProfile();
  if (hasSession) {
    await openDashboard();
  } else {
    showView("view-home");
  }
})();

sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    refreshNavUserArea();
  }
});
