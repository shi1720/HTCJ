import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe2,
  Layers3,
  Link2,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  AppState,
  EvidenceSource,
  Mission,
  LabReport,
  User,
  Site,
} from "../shared/types";
import { api, ApiError, money, date } from "./api";
import { decisionReport, type DecisionPacket } from "./report";
import { AccountSecurity, RecoveryKey } from "./AccountSecurity";
import { SourceHistory } from "./SourceHistory";

type Page =
  | "overview"
  | "missions"
  | "evidence"
  | "review"
  | "lab"
  | "audit"
  | "settings";
type Modal =
  | { type: "source"; source: EvidenceSource }
  | { type: "mission"; mission: Mission }
  | { type: "editRecord"; source: EvidenceSource }
  | { type: "editMission"; mission: Mission }
  | { type: "newMission" }
  | { type: "newSource" }
  | { type: "newSite" }
  | null;
const labels: Record<Page, string> = {
  overview: "Operations overview",
  missions: "Mission board",
  evidence: "Evidence library",
  review: "Review desk",
  lab: "Proof lab",
  audit: "Audit trail",
  settings: "Workspace",
};
const categoryLabels: Record<string, string> = {
  "site-access": "Site access",
  airspace: "Airspace reference",
  insurance: "Insurance",
  "operating-policy": "Operating policy",
};
const statusLabels: Record<string, string> = {
  ready: "Review complete",
  hold: "On hold",
  review: "Needs review",
  draft: "Awaiting signoff",
};
function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <CheckCheck size={small ? 19 : 23} />
      </span>
      <span>
        groundproof<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span className="status-dot" />
      {statusLabels[status] || status}
    </span>
  );
}
function captureIssue(s: EvidenceSource, now: string): string | null {
  if (!s.latest) return "Capture this source before reviewing it.";
  if (s.lastError)
    return "The latest capture failed. Capture the source again before recording a decision.";
  const time = Date.parse(now),
    captured = Date.parse(s.latest.capturedAt);
  if (
    !Number.isFinite(captured) ||
    captured > time ||
    time - captured >= s.freshnessHours * 3600000
  )
    return s.kind === "record"
      ? "This record needs a current version. Update it before reviewing."
      : "This capture is out of date. Capture the source again before reviewing.";
  if (
    s.validUntil &&
    (!Number.isFinite(Date.parse(s.validUntil)) ||
      Date.parse(s.validUntil) <= time)
  )
    return "This record has expired. Obtain current evidence and update the record before reviewing.";
  return null;
}
function sourceStatus(s: EvidenceSource, now: string) {
  if (captureIssue(s, now)) return "hold";
  if (s.reviewedHash !== s.latest?.hash || !s.reviewDecision) return "review";
  return s.reviewDecision === "blocked" ? "hold" : "ready";
}
function canSignOff(mission: Mission, state: AppState) {
  return (
    mission.sourceIds.length > 0 &&
    mission.sourceIds.every((id) => {
      const source = state.sources.find((item) => item.id === id);
      return source && sourceStatus(source, state.serverTime) === "ready";
    }) &&
    !mission.assessment.issues.some((issue) =>
      ["missing", "stale", "blocked", "unavailable"].includes(issue.code),
    )
  );
}
function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={32} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
function ModalFrame({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  dismissible = true,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const dismissRef = useRef(dismissible);
  closeRef.current = onClose;
  dismissRef.current = dismissible;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = ref.current;
    const overflow = document.body.style.overflow;
    const focusable = () =>
      [
        ...(frame?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? []),
      ].filter(
        (element) =>
          element.getClientRects().length > 0 && element.tabIndex >= 0,
      );
    (focusable()[0] ?? frame)?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab" && frame) {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!nodes.length) {
          event.preventDefault();
          frame.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            !frame.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !frame.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          {dismissible && (
            <IconButton label="Close dialog" onClick={onClose}>
              <X size={20} />
            </IconButton>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
function Landing({
  onUser,
  onError,
}: {
  onUser: (u: User, recoveryKey?: string) => void;
  onError: (s: string) => void;
}) {
  const [mode, setMode] = useState<
    "landing" | "login" | "register" | "recover"
  >("landing");
  const [busy, setBusy] = useState(false);
  async function demo() {
    setBusy(true);
    try {
      const r = await api<{ user: User }>("/demo/start", {});
      onUser(r.user);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const r = await api<{ user: User; recoveryKey?: string }>(
        `/auth/${mode}`,
        form,
      );
      onUser(r.user, r.recoveryKey);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <div className="landing-nav">
          <span>Built for commercial drone operations</span>
          <button className="button ghost" onClick={() => setMode("login")}>
            Sign in <ArrowUpRight size={16} />
          </button>
        </div>
      </header>
      <main className="landing-main">
        <div className="landing-copy">
          <div className="eyebrow">
            <span className="signal-dot" /> OPERATIONAL EVIDENCE, KEPT CURRENT
          </div>
          <h1>
            Yesterday’s approval.
            <br />
            <em>Today’s reality.</em>
          </h1>
          <p>
            A site closes. A requirement changes. Your flight schedule shouldn’t
            be the last to know.
          </p>
          <p className="landing-secondary">
            GroundProof connects every drone mission to the evidence behind it,
            catches changes, and brings the right jobs back for review.
          </p>
          <div className="landing-actions">
            <button
              className="button primary large"
              onClick={demo}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}{" "}
              Explore the working demo
            </button>
            <button
              className="button secondary large"
              onClick={() => setMode("register")}
            >
              Create workspace
            </button>
          </div>
          <div className="landing-note">
            <ShieldCheck size={16} /> No credit card. No API key. Your own
            isolated demo.
          </div>
          <div className="landing-footnote">
            Built by Shivam Gupta · HTCJ × PROOF Aviation Futures 2026
          </div>
        </div>
        <div className="landing-visual">
          <div className="visual-top">
            <span className="mono">THE GROUNDPROOF LOOP</span>
            <span className="tiny-pill">Evidence → decision</span>
          </div>
          <div className="orbit-map">
            <div className="orbit-ring r1" />
            <div className="orbit-ring r2" />
            <div className="orbit-ring r3" />
            <div className="orbit-center">
              <Layers3 size={40} />
              <span>
                One source.
                <br />
                Every affected mission.
              </span>
            </div>
            <div className="floating-card fc1">
              <div className="source-icon">
                <Globe2 size={20} />
              </div>
              <div>
                <strong>Site access notice</strong>
                <small>A new version is captured</small>
              </div>
              <span className="mini-alert" />
            </div>
            <div className="floating-card fc2">
              <div className="source-icon amber">
                <ShieldOff size={20} />
              </div>
              <div>
                <strong>Old signoff invalidated</strong>
                <small>Only dependent missions are held</small>
              </div>
            </div>
            <div className="floating-card fc3">
              <div className="source-icon green">
                <FileCheck2 size={20} />
              </div>
              <div>
                <strong>A traceable review</strong>
                <small>Source. Version. Reviewer. Decision.</small>
              </div>
            </div>
          </div>
          <div className="visual-bottom">
            <span>
              <span className="signal-dot" /> Change-aware by design
            </span>
            <span>Human review stays in control</span>
          </div>
        </div>
      </main>
      <section className="landing-principles">
        <div>
          <span>01</span>
          <h3>Capture the evidence</h3>
          <p>Keep the source, timestamp, and exact content version.</p>
        </div>
        <div>
          <span>02</span>
          <h3>Know what changed</h3>
          <p>See which scheduled jobs relied on the old information.</p>
        </div>
        <div>
          <span>03</span>
          <h3>Review with a record</h3>
          <p>Release work with a fresh decision and an exportable trail.</p>
        </div>
      </section>
      <footer className="landing-footer">
        Operational evidence management. Flight authorization and preflight
        checks remain with the operator.
        <a
          href="https://github.com/shi1720/HTCJ"
          target="_blank"
          rel="noreferrer"
        >
          Source & documentation <ArrowUpRight size={13} />
        </a>
      </footer>
      {mode !== "landing" && (
        <ModalFrame
          title={
            mode === "login"
              ? "Welcome back"
              : mode === "recover"
                ? "Recover your workspace"
                : "Your operations, in one place"
          }
          eyebrow={
            mode === "login"
              ? "SIGN IN"
              : mode === "recover"
                ? "ACCOUNT RECOVERY"
                : "CREATE A WORKSPACE"
          }
          onClose={() => setMode("landing")}
        >
          <form onSubmit={auth} className="form-stack">
            {mode === "register" && (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Shivam Gupta"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  Workspace name
                  <input
                    name="workspace"
                    placeholder="Your drone operations team"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
              </>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </label>
            {mode === "recover" && (
              <>
                <p className="muted small-text">
                  Enter your saved recovery key and choose a new password. You
                  will receive a replacement key after recovery. No email reset
                  link is needed.
                </p>
                <label>
                  Recovery key
                  <input
                    name="recoveryKey"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>
              </>
            )}
            <label>
              {mode === "recover" ? "New password" : "Password"}
              <input
                name={mode === "recover" ? "newPassword" : "password"}
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={12}
                maxLength={128}
                required
                placeholder={
                  mode === "register"
                    ? "At least 12 characters"
                    : "Your password"
                }
              />
            </label>
            {mode === "register" && (
              <p className="muted small-text">
                Create a private workspace with no sample missions. Start with a
                site and its evidence sources.
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <LockKeyhole size={16} />
              )}{" "}
              {mode === "login"
                ? "Sign in"
                : mode === "recover"
                  ? "Recover account"
                  : "Create workspace"}
            </button>
            {mode === "login" && (
              <button
                type="button"
                className="text-button"
                onClick={() => setMode("recover")}
              >
                Forgot your password? Use a recovery key
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login"
                ? "New here? Create a workspace"
                : "Already have a workspace? Sign in"}
            </button>
          </form>
        </ModalFrame>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [initial, setInitial] = useState(true);
  const [page, setPage] = useState<Page>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [provider, setProvider] = useState<"direct" | "anakin">("direct");
  const [lab, setLab] = useState<LabReport | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(
    () => window.matchMedia("(max-width: 720px)").matches,
  );
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [connectionIssue, setConnectionIssue] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const sessionGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const [roi, setRoi] = useState({ jobs: 120, minutes: 8, rate: 45 });
  const notify = (text: string, error = false) => setToast({ text, error });
  function clearWorkspace() {
    sessionGeneration.current += 1;
    refreshSequence.current += 1;
    setUser(null);
    setState(null);
    setModal(null);
    setRecoveryKey(null);
    setBusy("");
    setToast(null);
    setConnectionIssue("");
    setPage("overview");
    setNavOpen(false);
  }
  async function refresh() {
    const generation = sessionGeneration.current;
    const sequence = ++refreshSequence.current;
    try {
      const data = await api<AppState>("/state");
      if (
        generation === sessionGeneration.current &&
        sequence === refreshSequence.current
      ) {
        setState(data);
        setConnectionIssue("");
        setUser(data.user);
      }
      return data;
    } catch (error) {
      // An older request must not end or show errors in a replacement session.
      if (
        generation !== sessionGeneration.current ||
        sequence !== refreshSequence.current
      )
        return;
      throw error;
    }
  }
  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setInitial(false));
  }, []);
  useEffect(() => {
    if (user)
      refresh().catch((e) => {
        notify(e.message, true);
        if (e instanceof ApiError && e.status === 401) clearWorkspace();
      });
  }, [user?.id]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      refresh().catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearWorkspace();
          notify("Your session ended. Sign in again to continue.", true);
        } else
          setConnectionIssue(
            "Workspace updates are paused. Reconnect and refresh before making a decision.",
          );
      });
    }, 30000);
    return () => clearInterval(timer);
  }, [user?.id]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => {
      setCompactNavigation(media.matches);
      if (!media.matches) setNavOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!navOpen) return;
    const panel = navRef.current,
      previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    const nodes = () =>
      [
        ...(panel?.querySelectorAll<HTMLElement>("button,a[href]") ?? []),
      ].filter(
        (item) =>
          item.getClientRects().length > 0 && !item.hasAttribute("disabled"),
      );
    nodes()[0]?.focus();
    document.body.style.overflow = "hidden";
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
      if (event.key === "Tab") {
        const items = nodes();
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      if (previous?.isConnected) previous.focus();
    };
  }, [navOpen]);
  async function mutate(
    path: string,
    body: unknown,
    success: string,
    close = false,
    method?: string,
  ) {
    const generation = sessionGeneration.current;
    setBusy(path);
    try {
      await api(path, body, method);
      if (generation !== sessionGeneration.current) return false;
      try {
        await refresh();
      } catch {
        setConnectionIssue(
          "Your change was saved, but the workspace could not refresh. Refresh to see the latest state.",
        );
      }
      if (generation !== sessionGeneration.current) return false;
      if (close) setModal(null);
      notify(success);
      return true;
    } catch (error) {
      if (generation === sessionGeneration.current)
        notify((error as Error).message, true);
      return false;
    } finally {
      if (generation === sessionGeneration.current) setBusy("");
    }
  }
  async function drill(scenario: string) {
    const succeeded = await mutate(
      "/demo/drill",
      { scenario },
      scenario === "closure"
        ? "Change captured. Affected missions require a fresh review."
        : scenario === "restore"
          ? "New evidence captured. Review and sign off again to release work."
          : "Failure injected. The evidence gate is holding affected work.",
    );
    if (succeeded) setPage("overview");
  }
  const closeModal = () => setModal(null);
  if (initial)
    return (
      <div className="loading-screen">
        <Brand />
        <Loader2 className="spin" />
        <p>Opening your evidence desk…</p>
      </div>
    );
  if (!user)
    return (
      <>
        <Landing
          onUser={(account, key) => {
            sessionGeneration.current += 1;
            refreshSequence.current += 1;
            setState(null);
            setToast(null);
            setConnectionIssue("");
            setUser(account);
            setRecoveryKey(key ?? null);
          }}
          onError={(s) => notify(s, true)}
        />
        {toast && (
          <div role="alert" className={`toast ${toast.error ? "error" : ""}`}>
            <TriangleAlert size={18} />
            {toast.text}
            <IconButton
              label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              <X size={16} />
            </IconButton>
          </div>
        )}
      </>
    );
  if (!state)
    return (
      <div className="loading-screen">
        <Brand />
        <Loader2 className="spin" />
        <p>Loading your workspace…</p>
        {toast && (
          <>
            <p role="alert">{toast.text}</p>
            <button
              className="button secondary"
              onClick={() => {
                clearWorkspace();
              }}
            >
              Return to sign in
            </button>
          </>
        )}
      </div>
    );
  const current = state;
  const held = current.missions.filter((m) => m.assessment.status !== "ready");
  const ready = current.missions.filter((m) => m.assessment.status === "ready");
  const reviewSources = current.sources.filter(
    (s) => sourceStatus(s, current.serverTime) !== "ready",
  );
  const filteredSources = current.sources.filter((source) =>
    `${source.title} ${source.reference ?? ""} ${source.url} ${categoryLabels[source.category]}`
      .toLowerCase()
      .includes(sourceSearch.toLowerCase()),
  );
  const signoffQueue = current.missions.filter(
    (m) => m.assessment.status !== "ready" && canSignOff(m, current),
  );
  const exposure = held.reduce((sum, m) => sum + m.value, 0);
  const filtered = current.missions.filter(
    (m) =>
      (filter === "all" || m.assessment.status === filter) &&
      `${m.name} ${m.client} ${current.sites.find((s) => s.id === m.siteId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const navigate = (p: Page) => {
    setPage(p);
    setSearch("");
    setSourceSearch("");
    setFilter("all");
    window.scrollTo({ top: 0 });
    setNavOpen(false);
  };
  const selectedSource =
    modal?.type === "source"
      ? current.sources.find((s) => s.id === modal.source.id) || modal.source
      : null;
  const selectedMission =
    modal?.type === "mission"
      ? current.missions.find((m) => m.id === modal.mission.id) || modal.mission
      : null;
  function missionTable(missions: Mission[], compact = false) {
    return missions.length ? (
      <>
        <div className="mobile-mission-list">
          {missions.map((mission) => (
            <button
              className="mobile-mission-card"
              key={mission.id}
              aria-label={mission.name}
              onClick={() => setModal({ type: "mission", mission })}
            >
              <div className="mobile-mission-heading">
                <div>
                  <strong>{mission.name}</strong>
                  <span>{mission.client}</span>
                </div>
                <Badge status={mission.assessment.status} />
              </div>
              <div className="mobile-mission-meta">
                <span>
                  <MapPin size={14} />
                  {
                    current.sites.find((site) => site.id === mission.siteId)
                      ?.name
                  }
                </span>
                <span>
                  <Clock3 size={14} />
                  {date(mission.scheduledAt)}
                </span>
              </div>
              <div className="mobile-mission-bottom">
                <span>
                  Booked value <strong>{money(mission.value)}</strong>
                </span>
                <span>
                  Open decision <ChevronRight size={15} />
                </span>
              </div>
            </button>
          ))}
        </div>
        <div className="table-scroll desktop-mission-list">
          <table className="mission-table">
            <thead>
              <tr>
                <th>Mission / client</th>
                <th>Site</th>
                {!compact && <th>Scheduled (local)</th>}
                <th>Evidence status</th>
                <th className="align-right">Job value</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {missions.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setModal({ type: "mission", mission: m })}
                >
                  <td>
                    <button
                      className="table-title"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ type: "mission", mission: m });
                      }}
                    >
                      {m.name}
                    </button>
                    <span className="cell-sub">{m.client}</span>
                  </td>
                  <td>
                    <span className="site-cell">
                      <MapPin size={13} />
                      {current.sites.find((s) => s.id === m.siteId)?.name ||
                        "Unknown site"}
                    </span>
                  </td>
                  {!compact && (
                    <td className="mono small-text">{date(m.scheduledAt)}</td>
                  )}
                  <td>
                    <Badge status={m.assessment.status} />
                  </td>
                  <td className="align-right mono">{money(m.value)}</td>
                  <td>
                    <ChevronRight size={15} className="muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ) : page === "missions" && current.missions.length ? (
      <Empty
        title="No missions match your filters"
        body="Try a different mission, client or site name, or clear the status filter."
        action={
          <button
            className="button secondary"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        }
      />
    ) : (
      <Empty
        title="No missions here yet"
        body="Create a mission and connect the evidence your team needs to review."
        action={
          <button
            className="button secondary"
            onClick={() => setModal({ type: "newMission" })}
          >
            <Plus size={16} /> Add mission
          </button>
        }
      />
    );
  }
  return (
    <div className="app-shell">
      <aside
        ref={navRef}
        id="workspace-navigation"
        inert={compactNavigation && !navOpen}
        aria-hidden={compactNavigation && !navOpen ? true : undefined}
        role={compactNavigation && navOpen ? "dialog" : undefined}
        aria-modal={compactNavigation && navOpen ? true : undefined}
        aria-label="Workspace navigation"
        className={`sidebar ${navOpen ? "open" : ""}`}
      >
        <div className="sidebar-brand">
          <Brand small />
          <button
            className="icon-button nav-close"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <button
          className="workspace-switch"
          onClick={() => navigate("settings")}
        >
          <div className="workspace-icon">
            {user.workspace.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{user.workspace}</strong>
            <small>{user.demo ? "Demo workspace" : "Private workspace"}</small>
          </div>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {(
            [
              { id: "overview", icon: Layers3 },
              { id: "missions", icon: MapPin },
              { id: "evidence", icon: BookOpen },
              { id: "review", icon: FileCheck2 },
              { id: "lab", icon: FlaskConical },
              { id: "audit", icon: Activity },
            ] as const
          ).map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-item ${page === id ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{labels[id]}</span>
              {id === "review" &&
                reviewSources.length + signoffQueue.length > 0 && (
                  <span className="nav-count" aria-hidden="true">
                    {reviewSources.length + signoffQueue.length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="signal-dot" />
            <span>Evidence before action</span>
            <p>A current record for every operational decision.</p>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} /> Workspace settings
          </button>
          <div className="user-row">
            <div className="avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.demo ? "Demo reviewer" : "Workspace owner"}</small>
            </div>
            <IconButton
              label="Sign out"
              onClick={async () => {
                try {
                  await api("/auth/logout", {});
                  clearWorkspace();
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              <LogOut size={16} />
            </IconButton>
          </div>
        </div>
      </aside>
      {navOpen && (
        <div className="nav-scrim" onClick={() => setNavOpen(false)} />
      )}
      <div className="app-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              aria-controls="workspace-navigation"
              onClick={() => setNavOpen(!navOpen)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{labels[page]}</strong>
          </div>
          <div className="topbar-right">
            {user.demo && (
              <span className="demo-label">
                <FlaskConical size={12} /> SIMULATED OPERATIONS
              </span>
            )}
            <span className="topbar-date">
              {new Date(current.serverTime).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <IconButton
              label="Refresh workspace"
              onClick={() =>
                refresh()
                  .then(() => notify("Workspace is up to date."))
                  .catch((e) => notify(e.message, true))
              }
            >
              <RefreshCw size={16} />
            </IconButton>
          </div>
        </header>
        <main className="main-content" id="main-content">
          {connectionIssue && (
            <div className="callout error" role="status">
              <TriangleAlert size={17} />
              <p>{connectionIssue}</p>
              <button
                className="text-button"
                onClick={() => refresh().catch((e) => notify(e.message, true))}
              >
                Retry connection
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "overview"
                  ? "YOUR DAILY OPERATIONS BRIEF"
                  : "GROUNDPROOF / " + page.toUpperCase()}
              </span>
              <h1>
                {page === "overview"
                  ? "Every mission. A current reason."
                  : labels[page]}
              </h1>
              <p>
                {
                  {
                    overview:
                      "Know what changed before your crews leave the ground.",
                    missions:
                      "Scheduled work, connected to the evidence behind each signoff.",
                    evidence:
                      "The sources your operations depend on, with every version preserved.",
                    review:
                      "A human decision, tied to the exact evidence in front of you.",
                    lab: "Challenge the evidence gate. See the results, not just the promise.",
                    audit:
                      "A chronological record of captures, decisions, and signoffs.",
                    settings:
                      "Your workspace, integrations, and a transparent value model.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "evidence" ? (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "newSource" })}
                >
                  <Plus size={16} /> Add source
                </button>
              ) : page === "missions" || page === "overview" ? (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "newMission" })}
                >
                  <Plus size={16} /> New mission
                </button>
              ) : page === "review" ? (
                <span className="review-total">
                  {reviewSources.length} sources · {signoffQueue.length}{" "}
                  signoffs
                </span>
              ) : null}
            </div>
          </div>
          {page === "overview" && (
            <>
              {!user.demo &&
                (!current.sites.length ||
                  !current.sources.length ||
                  !current.missions.length) && (
                  <section className="onboarding-panel">
                    <div>
                      <span className="eyebrow">GET YOUR FIRST JOB READY</span>
                      <h2>A site. Its evidence. A recorded decision.</h2>
                      <p>
                        Add the operating location, preserve what you rely on,
                        then connect it to a mission.
                      </p>
                    </div>
                    <ol className="setup-steps">
                      <li className={current.sites.length ? "complete" : ""}>
                        <span>
                          {current.sites.length ? <Check size={16} /> : "1"}
                        </span>
                        <div>
                          <strong>Add an operating site</strong>
                          <p>The location where your team plans to work.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setModal({ type: "newSite" })}
                        >
                          {current.sites.length ? "Add another" : "Add site"}
                          <ArrowRight size={15} />
                        </button>
                      </li>
                      <li className={current.sources.length ? "complete" : ""}>
                        <span>
                          {current.sources.length ? <Check size={16} /> : "2"}
                        </span>
                        <div>
                          <strong>Keep the evidence</strong>
                          <p>A public source or an operator-supplied record.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => {
                            navigate("evidence");
                            if (!current.sources.length)
                              setModal({ type: "newSource" });
                          }}
                        >
                          {current.sources.length
                            ? "View evidence"
                            : "Add evidence"}
                          <ArrowRight size={15} />
                        </button>
                      </li>
                      <li>
                        <span>3</span>
                        <div>
                          <strong>Connect a mission</strong>
                          <p>Choose its sources, review them and sign off.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setModal({ type: "newMission" })}
                        >
                          Plan mission
                          <ArrowRight size={15} />
                        </button>
                      </li>
                    </ol>
                  </section>
                )}
              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">
                    Scheduled missions <MapPin size={16} />
                  </div>
                  <strong>
                    {current.missions.length.toString().padStart(2, "0")}
                  </strong>
                  <span>Across {current.sites.length} operating sites</span>
                </div>
                <div className="stat-card">
                  <div className="stat-label">
                    Review complete <CircleCheck size={16} />
                  </div>
                  <strong>
                    {ready.length.toString().padStart(2, "0")}
                    <span className="stat-unit">
                      / {current.missions.length}
                    </span>
                  </strong>
                  <span>
                    <span className="small-dot green" /> Current evidence,
                    matching signoff
                  </span>
                </div>
                <div className={`stat-card ${held.length ? "attention" : ""}`}>
                  <div className="stat-label">
                    Needs attention <TriangleAlert size={16} />
                  </div>
                  <strong>{held.length.toString().padStart(2, "0")}</strong>
                  <span>
                    {held.length
                      ? "Mission reviews affected"
                      : "No unresolved evidence changes"}
                  </span>
                </div>
                <div className="stat-card">
                  <div className="stat-label">
                    Booked value on hold <ArrowUpRight size={16} />
                  </div>
                  <strong>{money(exposure)}</strong>
                  <span>
                    {user.demo
                      ? "Scenario value · not measured savings"
                      : "Value of jobs awaiting review"}
                  </span>
                </div>
              </section>
              {user.demo && (
                <section
                  className={`demo-banner ${held.length ? "changed" : ""}`}
                >
                  <div className="demo-banner-icon">
                    {held.length ? (
                      <TriangleAlert size={21} />
                    ) : (
                      <Sparkles size={21} />
                    )}
                  </div>
                  <div>
                    <span className="eyebrow">
                      {held.length
                        ? "THE CHANGE HAS A CONSEQUENCE"
                        : "TRY THE DEFINING MOMENT"}
                    </span>
                    <h3>
                      {held.length
                        ? `${held.length} ${held.length === 1 ? "mission needs" : "missions need"} a fresh decision.`
                        : "What if the site closes after you approve the job?"}
                    </h3>
                    <p>
                      {held.length
                        ? "Open an affected mission or review the changed source. Old signoffs cannot release the work."
                        : "Inject a fictional site closure. Watch the linked missions lose their previous signoff."}
                    </p>
                  </div>
                  <button
                    className="button dark"
                    disabled={!!busy}
                    onClick={() =>
                      held.length ? navigate("review") : drill("closure")
                    }
                  >
                    {held.length
                      ? "Review the change"
                      : "Simulate site closure"}
                    <ArrowRight size={16} />
                  </button>
                </section>
              )}
              <div className="overview-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Site intelligence</h2>
                      <span>
                        {current.sites.length} sites · evidence dependency view
                      </span>
                    </div>
                    <span className="tiny-pill">
                      {user.demo ? "BOSTON AREA DEMO" : "SCHEMATIC VIEW"}
                    </span>
                  </div>
                  <SiteMap
                    sites={current.sites}
                    missions={current.missions}
                    onSelect={(site) => {
                      navigate("missions");
                      setSearch(site.name);
                    }}
                  />
                  <div className="map-legend">
                    <span>
                      <i className="legend-dot ready" /> Current review
                    </span>
                    <span>
                      <i className="legend-dot hold" /> Attention needed
                    </span>
                    <small>Illustrative positions · not for navigation</small>
                  </div>
                </section>
                <section className="panel pulse-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Evidence pulse</h2>
                      <span>Your most recent activity</span>
                    </div>
                    <Activity size={17} className="muted" />
                  </div>
                  <div className="pulse-list">
                    {current.audit.slice(0, 4).map((e, i) => (
                      <div className="pulse-item" key={e.id}>
                        <div className={`pulse-icon ${i === 0 ? "fresh" : ""}`}>
                          {e.action.includes("approv") ? (
                            <Check size={15} />
                          ) : e.action.includes("review") ? (
                            <FileCheck2 size={15} />
                          ) : (
                            <RefreshCw size={15} />
                          )}
                        </div>
                        <div>
                          <strong>
                            {e.objectName || e.action.replaceAll("_", " ")}
                          </strong>
                          <p>{e.detail}</p>
                          <time>{date(e.at)}</time>
                        </div>
                      </div>
                    ))}
                    {!current.audit.length && (
                      <Empty
                        title="A fresh start"
                        body="Your first source capture starts the record."
                      />
                    )}
                  </div>
                  <button
                    className="panel-footer-link"
                    onClick={() => navigate("audit")}
                  >
                    Open audit trail <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Mission watchlist{" "}
                      <span className="heading-count">
                        {current.missions.length}
                      </span>
                    </h2>
                    <span>
                      {held.length
                        ? "Affected work is shown first."
                        : "Every signoff has a source behind it."}
                    </span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("missions")}
                  >
                    All missions <ArrowUpRight size={15} />
                  </button>
                </div>
                {missionTable(
                  [
                    ...held,
                    ...current.missions.filter((m) => !held.includes(m)),
                  ].slice(0, 5),
                  true,
                )}
              </section>
            </>
          )}
          {page === "missions" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="filter-tabs">
                  {["all", "ready", "review", "hold", "draft"].map((s) => (
                    <button
                      key={s}
                      className={filter === s ? "selected" : ""}
                      aria-pressed={filter === s}
                      onClick={() => setFilter(s)}
                    >
                      {s === "all" ? "All missions" : statusLabels[s]}
                    </button>
                  ))}
                </div>
                <label className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search missions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search missions or sites"
                  />
                </label>
              </div>
              {missionTable(filtered)}
              <div className="table-footer">
                <span>
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "mission" : "missions"} shown
                </span>
                <button
                  className="text-button"
                  onClick={() => setModal({ type: "newSite" })}
                >
                  <Plus size={14} /> Add operating site
                </button>
              </div>
            </section>
          )}
          {page === "evidence" && (
            <>
              <div className="evidence-toolbar">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search evidence"
                    value={sourceSearch}
                    onChange={(event) => setSourceSearch(event.target.value)}
                    placeholder="Find a source or document"
                  />
                </label>
                <div className="info-inline">
                  <ShieldCheck size={17} /> A capture is evidence. A review is a
                  separate decision.
                </div>
                <label className="inline-label">
                  Capture with
                  <select
                    value={provider}
                    onChange={(e) =>
                      setProvider(e.target.value as typeof provider)
                    }
                  >
                    <option value="direct">Direct government source</option>
                    <option value="anakin">Anakin API</option>
                  </select>
                </label>
              </div>
              <div className="source-grid">
                {filteredSources.map((s) => (
                  <SourceCard
                    key={s.id}
                    source={s}
                    now={current.serverTime}
                    count={
                      current.missions.filter((m) => m.sourceIds.includes(s.id))
                        .length
                    }
                    busy={busy}
                    onOpen={() => setModal({ type: "source", source: s })}
                    onCapture={() =>
                      mutate(
                        `/sources/${s.id}/capture`,
                        { provider },
                        "Source captured. Review any new content before approving work.",
                      )
                    }
                  />
                ))}
              </div>
              {current.sources.length > 0 && !filteredSources.length && (
                <section className="panel">
                  <Empty
                    title="No evidence matches your search"
                    body="Search a source title, document reference, category or website."
                    action={
                      <button
                        className="button secondary"
                        onClick={() => setSourceSearch("")}
                      >
                        Clear search
                      </button>
                    }
                  />
                </section>
              )}
              {!current.sources.length && (
                <section className="panel">
                  <Empty
                    title="Start with the source of truth"
                    body="Add an official public page, or record the conditions from written site permission or insurance evidence you hold."
                    action={
                      <button
                        className="button primary"
                        onClick={() => setModal({ type: "newSource" })}
                      >
                        <Plus size={16} /> Add your first source
                      </button>
                    }
                  />
                </section>
              )}
              <div className="scope-note">
                <BookOpen size={16} />
                <p>
                  Captures preserve public-page content for operational review.
                  They do not establish permission, interpret regulations, or
                  verify a pilot’s authorizations. Demo evidence is fictional
                  and marked throughout.
                </p>
              </div>
            </>
          )}
          {page === "review" && (
            <>
              <section className="review-intro">
                <div className="source-icon amber">
                  <FileCheck2 size={23} />
                </div>
                <div>
                  <h3>Changed evidence deserves a new decision.</h3>
                  <p>
                    Compare versions, document what you checked, then re-sign
                    each affected mission. A source review alone does not
                    restore an old approval.
                  </p>
                </div>
              </section>
              {reviewSources.length ? (
                <div className="review-list">
                  {reviewSources.map((s) => (
                    <button
                      className="review-row"
                      key={s.id}
                      onClick={() => setModal({ type: "source", source: s })}
                    >
                      <div className="review-row-icon">
                        <Globe2 size={21} />
                      </div>
                      <div className="review-row-main">
                        <div>
                          <h3>{s.title}</h3>
                          <span className="tiny-pill">
                            {s.fixture
                              ? "DEMO FIXTURE"
                              : s.kind === "record"
                                ? "OPERATOR RECORD"
                                : "PUBLIC SOURCE"}
                          </span>
                        </div>
                        <p>
                          {captureIssue(s, current.serverTime) ||
                            (s.reviewedHash !== s.latest?.hash
                              ? "New content needs a review before its missions can be signed off."
                              : "A reviewer recorded a hold for the current evidence.")}
                        </p>
                      </div>
                      <div className="review-row-impact">
                        <strong>
                          {
                            current.missions.filter((m) =>
                              m.sourceIds.includes(s.id),
                            ).length
                          }{" "}
                          missions
                        </strong>
                        <span>depend on this source</span>
                      </div>
                      <Badge status={sourceStatus(s, current.serverTime)} />
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    title={
                      signoffQueue.length
                        ? "Sources checked. Complete the mission signoffs below."
                        : "The review desk is clear"
                    }
                    body={
                      signoffQueue.length
                        ? "An accepted source is the first step. Each mission still needs its own decision against the current evidence."
                        : "Sources have current reviews and there are no eligible missions awaiting signoff."
                    }
                    action={
                      user.demo ? (
                        <button
                          className="button secondary"
                          onClick={() => drill("closure")}
                        >
                          <FlaskConical size={16} /> Inject a source change
                        </button>
                      ) : undefined
                    }
                  />
                </section>
              )}
              {signoffQueue.length > 0 && (
                <section className="panel signoff-queue">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">NEXT STEP</span>
                      <h2>Ready for a mission signoff</h2>
                      <span>
                        Source reviews are complete. Open each mission and
                        record your decision.
                      </span>
                    </div>
                    <span className="heading-count">{signoffQueue.length}</span>
                  </div>
                  {missionTable(signoffQueue, true)}
                </section>
              )}
            </>
          )}
          {page === "lab" && (
            <>
              <div className="lab-hero">
                <div>
                  <span className="eyebrow">REPRODUCIBLE EVIDENCE</span>
                  <h2>
                    Trust the gate.
                    <br />
                    <em>Then try to break it.</em>
                  </h2>
                  <p>
                    Run authored scenarios against the same deterministic rules
                    used by your workspace. These are software checks, not
                    flight safety validation.
                  </p>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy("lab");
                      try {
                        setLab(await api<LabReport>("/lab/run", {}));
                        notify(
                          "Proof run complete. Results reflect this execution.",
                        );
                      } catch (e) {
                        notify((e as Error).message, true);
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {busy === "lab" ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <FlaskConical size={17} />
                    )}{" "}
                    Run verification suite
                  </button>
                </div>
                <div className="lab-result-hero">
                  <span className="mono">
                    {lab ? "LATEST RUN" : "AWAITING FIRST RUN"}
                  </span>
                  <strong>
                    {lab ? `${lab.passed}/${lab.total}` : "Not run"}
                  </strong>
                  <p>
                    {lab
                      ? `Scenarios passed · ${lab.durationMs.toFixed(1)} ms`
                      : "Run the suite to generate results"}
                  </p>
                  {lab && <small>{date(lab.at)}</small>}
                </div>
              </div>
              {lab && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Executed scenarios</h2>
                      <span>
                        Expected behavior compared with actual rule output
                      </span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        downloadJson(lab, "groundproof-verification.json")
                      }
                    >
                      Download results <ArrowDownToLine size={15} />
                    </button>
                  </div>
                  <div className="lab-results">
                    {lab.results.map((r, i) => (
                      <div key={i} className="lab-result-row">
                        <span
                          className={`lab-check ${r.passed ? "pass" : "fail"}`}
                        >
                          {r.passed ? <Check size={17} /> : <X size={17} />}
                        </span>
                        <div>
                          <strong>{r.name}</strong>
                          <p>
                            Expected: {r.expected} <span>·</span> Observed:{" "}
                            {r.actual}
                          </p>
                        </div>
                        <span className="mono muted">
                          {r.durationMs.toFixed(2)} ms
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {user.demo && (
                <section className="panel scenario-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Stress your workspace</h2>
                      <span>
                        These controls alter only your isolated fictional data.
                      </span>
                    </div>
                  </div>
                  <div className="scenario-buttons">
                    <button
                      className="scenario-button"
                      disabled={!!busy}
                      onClick={() => drill("closure")}
                    >
                      <ShieldOff />
                      <strong>Site closure</strong>
                      <span>Change a reviewed source</span>
                    </button>
                    <button
                      className="scenario-button"
                      disabled={!!busy}
                      onClick={() => drill("stale")}
                    >
                      <Clock3 />
                      <strong>Expired freshness</strong>
                      <span>Age the captured evidence</span>
                    </button>
                    <button
                      className="scenario-button"
                      disabled={!!busy}
                      onClick={() => drill("unavailable")}
                    >
                      <Globe2 />
                      <strong>Source unavailable</strong>
                      <span>Inject a capture failure</span>
                    </button>
                    <button
                      className="scenario-button"
                      disabled={!!busy}
                      onClick={() => drill("restore")}
                    >
                      <RefreshCw />
                      <strong>Updated access notice</strong>
                      <span>Recover with a new version</span>
                    </button>
                  </div>
                </section>
              )}
              <section className="proof-boundary">
                <h3>What this proves</h3>
                <p>
                  Our authored rule cases can detect invalid evidence and
                  prevent outdated operational signoffs. It does not prove field
                  reliability, regulatory compliance, customer savings, or
                  readiness for autonomous flight. A shadow pilot is the next
                  validation step.
                </p>
              </section>
            </>
          )}
          {page === "audit" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>The decision record</h2>
                  <span>
                    {current.audit.length} recent workspace events · newest
                    first
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    downloadJson(current.audit, "groundproof-audit.json")
                  }
                >
                  <ArrowDownToLine size={15} /> Export log
                </button>
              </div>
              <div className="audit-list">
                {current.audit.map((e) => (
                  <div className="audit-event" key={e.id}>
                    <div className="audit-dot" />
                    <time className="mono">{date(e.at)}</time>
                    <div>
                      <span className="audit-action">
                        {e.action.replaceAll("_", " ")}
                      </span>
                      <h3>{e.objectName}</h3>
                      <p>{e.detail}</p>
                      <small>Recorded by {e.actor}</small>
                    </div>
                  </div>
                ))}
                {!current.audit.length && (
                  <Empty
                    title="Your record begins here"
                    body="Create a site or capture a source to record your first event."
                  />
                )}
              </div>
            </section>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <span className="eyebrow">WORKSPACE</span>
                <h2>{user.workspace}</h2>
                <dl className="definition-list">
                  <div>
                    <dt>Owner</dt>
                    <dd>{user.name}</dd>
                  </div>
                  <div>
                    <dt>Account</dt>
                    <dd>
                      {user.demo
                        ? "Isolated demonstration session"
                        : user.email}
                    </dd>
                  </div>
                  <div>
                    <dt>Evidence sources</dt>
                    <dd>{current.sources.length}</dd>
                  </div>
                  <div>
                    <dt>Operating sites</dt>
                    <dd>{current.sites.length}</dd>
                  </div>
                </dl>
                <button
                  className="button secondary"
                  onClick={() => setModal({ type: "newSite" })}
                >
                  <Plus size={16} /> Add operating site
                </button>
                {user.demo && (
                  <>
                    <hr />
                    <h3>Restart the demonstration</h3>
                    <p className="muted small-text">
                      Rebuild the fictional missions and their initial evidence
                      in this demo workspace.
                    </p>
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() =>
                        mutate(
                          "/demo/reset",
                          {},
                          "Demo restored to its initial state.",
                        )
                      }
                    >
                      <RefreshCw size={15} /> Reset demo data
                    </button>
                  </>
                )}
              </section>
              <section className="panel settings-panel">
                <span className="eyebrow">SOURCE CAPTURE</span>
                <h2>Connected to the evidence</h2>
                <div className="integration-row">
                  <div className="source-icon">
                    <Globe2 size={21} />
                  </div>
                  <div>
                    <strong>Direct public sources</strong>
                    <p>Approved government domains</p>
                  </div>
                  <span className="tiny-pill green">AVAILABLE</span>
                </div>
                <div className="integration-row">
                  <div className="anakin-logo">a</div>
                  <div>
                    <strong>Anakin web API</strong>
                    <p>
                      {current.integrations.anakinConfigured
                        ? "Server key configured"
                        : "Keyless access · capacity dependent"}
                    </p>
                  </div>
                  <span className="tiny-pill">
                    {current.integrations.anakinConfigured
                      ? "CONFIGURED"
                      : "OPTIONAL"}
                  </span>
                </div>
                <p className="muted small-text">
                  Anakin is a real server-side capture adapter. Quota and
                  provider errors are shown as failures; direct captures keep
                  their own provenance. API keys stay on the server.
                </p>
                <a
                  className="text-button"
                  href="https://anakin.io/dashboard"
                  target="_blank"
                  rel="noreferrer"
                >
                  Anakin dashboard <ExternalLink size={14} />
                </a>
                <hr />
                <h3>Scope of the product</h3>
                <p className="muted small-text">
                  GroundProof manages evidence and operational review. It does
                  not issue flight authorizations, read live airspace, control
                  aircraft, or replace the remote pilot’s checks.
                </p>
              </section>
              {!user.demo && (
                <AccountSecurity
                  onRecoveryKey={setRecoveryKey}
                  onSignedOut={clearWorkspace}
                />
              )}
              <section className="panel roi-panel">
                <div>
                  <span className="eyebrow">COMMERCIAL HYPOTHESIS</span>
                  <h2>Make the business case yours.</h2>
                  <p className="muted">
                    Change the assumptions. These are planning estimates, not
                    measured customer results.
                  </p>
                </div>
                <div className="roi-inputs">
                  <label>
                    Missions / month
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={roi.jobs}
                      onChange={(e) =>
                        setRoi({
                          ...roi,
                          jobs: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    Minutes saved / mission
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={roi.minutes}
                      onChange={(e) =>
                        setRoi({
                          ...roi,
                          minutes: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    Loaded hourly cost ($)
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={roi.rate}
                      onChange={(e) =>
                        setRoi({
                          ...roi,
                          rate: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="roi-results">
                  <div>
                    <span>Estimated time value / month</span>
                    <strong>
                      {money(((roi.jobs * roi.minutes) / 60) * roi.rate)}
                    </strong>
                  </div>
                  <div>
                    <span>Proposed starting price</span>
                    <strong>
                      $199<span>/month</span>
                    </strong>
                  </div>
                  <div>
                    <span>Estimated value after subscription</span>
                    <strong>
                      {money(((roi.jobs * roi.minutes) / 60) * roi.rate - 199)}
                    </strong>
                  </div>
                </div>
                <p className="small-text muted">
                  Illustrative $199/month plan: 25 monitored sites. Team seats
                  are planned; this release has one workspace owner. Price and
                  willingness to pay require customer validation. Hosting,
                  source coverage, and review effort affect actual economics.
                </p>
              </section>
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={13} /> Operational review, with a record.
            </span>
            <span>
              {user.demo
                ? "All missions and site notices in this workspace are fictional."
                : "Flight authorization remains the operator’s responsibility."}
            </span>
            <span className="mono">GROUNDPROOF v1.0</span>
          </footer>
        </main>
      </div>
      {selectedSource && (
        <SourceDialog
          key={selectedSource.id}
          source={selectedSource}
          state={current}
          busy={busy}
          onClose={closeModal}
          onReview={(body) =>
            mutate(
              `/sources/${selectedSource.id}/review`,
              body,
              "Evidence decision recorded. Affected missions still need a fresh signoff.",
              true,
            )
          }
          onCapture={(selectedProvider) =>
            mutate(
              `/sources/${selectedSource.id}/capture`,
              { provider: selectedProvider },
              "New snapshot captured.",
            )
          }
          onMonitor={(body) =>
            mutate(
              `/sources/${selectedSource.id}/monitor`,
              body,
              "Monitoring preferences saved.",
              false,
              "PATCH",
            )
          }
          onEditRecord={() =>
            setModal({ type: "editRecord", source: selectedSource })
          }
          onMission={(mission) => setModal({ type: "mission", mission })}
        />
      )}
      {selectedMission && (
        <MissionDialog
          key={selectedMission.id}
          mission={selectedMission}
          state={current}
          busy={busy}
          onClose={closeModal}
          onApprove={(body) =>
            mutate(
              `/missions/${selectedMission.id}/approve`,
              body,
              "Fresh operational signoff recorded against current evidence.",
              true,
            )
          }
          onSource={(s) => setModal({ type: "source", source: s })}
          onEdit={() =>
            setModal({ type: "editMission", mission: selectedMission })
          }
          onPrint={async () => {
            const w = window.open("", "_blank");
            if (!w) {
              notify(
                "Allow a popup to open the printable decision report.",
                true,
              );
              return;
            }
            w.opener = null;
            w.document.write("<p>Preparing the decision record…</p>");
            try {
              const packet = await api<DecisionPacket>(
                `/missions/${selectedMission.id}/export`,
              );
              w.document.open();
              w.document.write(decisionReport(packet));
              w.document.close();
              w.focus();
              w.print();
            } catch (e) {
              w.close();
              notify((e as Error).message, true);
            }
          }}
          onExport={async () => {
            try {
              const bundle = await api(
                `/missions/${selectedMission.id}/export`,
              );
              downloadJson(bundle, `groundproof-${selectedMission.id}.json`);
              notify(
                "Decision packet exported with its evidence and integrity manifest.",
              );
            } catch (e) {
              notify((e as Error).message, true);
            }
          }}
        />
      )}
      {modal?.type === "editRecord" && (
        <ModalFrame
          title="Update operator record"
          eyebrow="NEW EVIDENCE VERSION"
          onClose={closeModal}
        >
          <RecordForm
            state={current}
            busy={!!busy}
            source={modal.source}
            onSubmit={(body) =>
              mutate(
                `/sources/${modal.source.id}/record`,
                body,
                "New record version saved. Dependent signoffs are invalidated.",
                true,
              )
            }
          />
        </ModalFrame>
      )}
      {modal?.type === "editMission" && (
        <CreateMission
          state={current}
          busy={!!busy}
          initial={modal.mission}
          onClose={closeModal}
          onSubmit={(body) =>
            mutate(
              `/missions/${modal.mission.id}`,
              body,
              "Mission updated. A fresh signoff is required.",
              true,
              "PATCH",
            )
          }
          onSite={() => setModal({ type: "newSite" })}
          onSource={() => setModal({ type: "newSource" })}
        />
      )}
      {modal?.type === "newSite" && (
        <CreateSite
          busy={!!busy}
          onClose={closeModal}
          onSubmit={(body) =>
            mutate("/sites", body, "Operating site created.", true)
          }
        />
      )}
      {modal?.type === "newSource" && (
        <CreateSource
          state={current}
          busy={!!busy}
          onClose={closeModal}
          onSubmit={(body) =>
            mutate(
              "/sources",
              body,
              "Source added. Capture it to begin the evidence record.",
              true,
            )
          }
          onRecord={(body) =>
            mutate(
              "/sources/record",
              body,
              "Operator record saved. Review it before signing off missions.",
              true,
            )
          }
        />
      )}
      {modal?.type === "newMission" && (
        <CreateMission
          state={current}
          busy={!!busy}
          onClose={closeModal}
          onSubmit={(body) =>
            mutate(
              "/missions",
              body,
              "Mission created and linked to its evidence.",
              true,
            )
          }
          onSite={() => setModal({ type: "newSite" })}
          onSource={() => setModal({ type: "newSource" })}
        />
      )}
      {recoveryKey && (
        <ModalFrame
          title="Save your recovery key"
          eyebrow="ACCOUNT ACCESS"
          onClose={() => {}}
          dismissible={false}
        >
          <RecoveryKey
            recoveryKey={recoveryKey}
            onDone={() => setRecoveryKey(null)}
          />
        </ModalFrame>
      )}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "error" : ""}`}
        >
          {toast.error ? (
            <TriangleAlert size={19} />
          ) : (
            <CircleCheck size={19} />
          )}
          <span>{toast.text}</span>
          <IconButton
            label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SiteMap({
  sites,
  missions,
  onSelect,
}: {
  sites: Site[];
  missions: Mission[];
  onSelect: (s: Site) => void;
}) {
  return (
    <div className="site-map">
      <svg
        viewBox="0 0 720 320"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="map-grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M30 0H0V30"
              fill="none"
              stroke="#dee3d9"
              strokeWidth="0.7"
            />
          </pattern>
          <pattern
            id="blocks"
            width="90"
            height="70"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-25)"
          >
            <rect x="6" y="6" width="73" height="53" rx="5" fill="#e3e7df" />
            <path
              d="M0 65H90M84 0V70"
              fill="none"
              stroke="#f5f6f1"
              strokeWidth="6"
            />
          </pattern>
        </defs>
        <rect width="720" height="320" fill="#edf0e8" />
        <rect width="720" height="320" fill="url(#blocks)" opacity=".7" />
        <path
          d="M0 180 C120 240 110 75 260 128 S390 205 465 133 S570 95 610 0 L720 0 L720 320 L565 320 C560 250 470 232 447 196 S340 230 270 183 S120 290 0 227Z"
          fill="#cddfdc"
        />
        <path
          d="M0 181 C120 241 110 76 260 129 S390 206 465 134 S570 96 610 0"
          fill="none"
          stroke="#b6d0cb"
          strokeWidth="3"
        />
        <path
          d="M90 0L230 320M0 67L567 290M279 0L606 320M380 0L375 320"
          stroke="#fbfcf8"
          strokeWidth="8"
          fill="none"
        />
        <path
          d="M90 0L230 320M0 67L567 290M279 0L606 320M380 0L375 320"
          stroke="#d3d9cd"
          strokeWidth="1"
          fill="none"
        />
        <rect width="720" height="320" fill="url(#map-grid)" opacity=".25" />
        <text x="260" y="282" fill="#99a597" fontSize="12" letterSpacing="4">
          BOSTON
        </text>
        <text
          x="542"
          y="195"
          fill="#94b2ac"
          fontSize="11"
          letterSpacing="2"
          transform="rotate(-22 542 195)"
        >
          HARBOR
        </text>
        <text x="55" y="59" fill="#99a597" fontSize="10" letterSpacing="2">
          GREATER BOSTON
        </text>
      </svg>
      <div className="map-north">
        <span>N</span>
        <ArrowUpRight size={14} />
      </div>
      {sites.slice(0, 6).map((s, i) => {
        const dependent = missions.filter((m) => m.siteId === s.id),
          held = dependent.some((m) =>
            ["hold", "review"].includes(m.assessment.status),
          );
        const positions = [
          [66, 30],
          [37, 66],
          [23, 32],
          [76, 75],
          [49, 42],
          [15, 78],
        ];
        return (
          <button
            key={s.id}
            className={`map-marker ${held ? "held" : ""}`}
            style={{ left: `${positions[i][0]}%`, top: `${positions[i][1]}%` }}
            onClick={() => onSelect(s)}
          >
            <span className="marker-dot">
              <MapPin size={17} />
            </span>
            <span className="marker-label">
              <strong>{s.name}</strong>
              <small>
                {dependent.length}{" "}
                {dependent.length === 1 ? "mission" : "missions"} ·{" "}
                {held ? "review needed" : "current"}
              </small>
            </span>
          </button>
        );
      })}
      {!sites.length && (
        <div className="map-empty">Add your first operating site</div>
      )}
    </div>
  );
}
function SourceCard({
  source: s,
  now,
  count,
  busy,
  onOpen,
  onCapture,
}: {
  source: EvidenceSource;
  now: string;
  count: number;
  busy: string;
  onOpen: () => void;
  onCapture: () => void;
}) {
  return (
    <article className="source-card">
      <div className="source-card-top">
        <div className="source-icon">
          <Globe2 size={22} />
        </div>
        <Badge status={sourceStatus(s, now)} />
      </div>
      <span className="eyebrow">{categoryLabels[s.category]}</span>
      <button className="source-title" onClick={onOpen}>
        {s.title}
      </button>
      <p className="source-url">
        {s.fixture
          ? "Fictional operator portal"
          : s.kind === "record"
            ? "Operator-supplied · " + s.reference
            : new URL(s.url).hostname}
      </p>
      <div className="source-meta">
        <span>
          <Link2 size={13} />
          {count} linked {count === 1 ? "mission" : "missions"}
        </span>
        <span>
          <Clock3 size={13} />
          {s.freshnessHours}h freshness
        </span>
      </div>
      <div className="source-version">
        <span>
          {s.fixture
            ? "DEMO FIXTURE"
            : s.latest
              ? `${s.latest.provider.toUpperCase()} CAPTURE`
              : "NOT CAPTURED"}
        </span>
        <code>{s.latest ? s.latest.hash.slice(0, 12) : "No snapshot"}</code>
      </div>
      {s.lastError && <div className="inline-error">{s.lastError}</div>}
      <div className="source-card-footer">
        <button className="text-button" onClick={onOpen}>
          Open evidence <ArrowRight size={14} />
        </button>
        {!s.fixture && s.kind !== "record" && (
          <button
            className="icon-button"
            title="Capture current source"
            aria-label={`Capture ${s.title}`}
            disabled={!!busy}
            onClick={onCapture}
          >
            {busy.includes(s.id) ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>
        )}
      </div>
    </article>
  );
}
function SourceDialog({
  source: s,
  state,
  busy,
  onClose,
  onReview,
  onCapture,
  onMonitor,
  onEditRecord,
  onMission,
}: {
  source: EvidenceSource;
  state: AppState;
  busy: string;
  onClose: () => void;
  onReview: (body: unknown) => void;
  onCapture: (provider: "direct" | "anakin") => void;
  onMonitor: (body: unknown) => void;
  onEditRecord: () => void;
  onMission: (mission: Mission) => void;
}) {
  const [reviewHash, setReviewHash] = useState(s.latest?.hash);
  const reviewOutdated = reviewHash !== s.latest?.hash;
  const [interval, setIntervalHours] = useState(s.monitor?.intervalHours || 6);
  const [monitorProvider, setMonitorProvider] = useState<"direct" | "anakin">(
    s.monitor?.provider ||
      (s.latest?.provider === "anakin" ? "anakin" : "direct"),
  );
  const [decision, setDecision] = useState<"accepted" | "blocked">("blocked");
  const [note, setNote] = useState("");
  const [captureProvider, setCaptureProvider] = useState<"direct" | "anakin">(
    s.latest?.provider === "anakin" ? "anakin" : "direct",
  );
  const reviewIssue = captureIssue(s, state.serverTime);
  const linked = state.missions.filter((m) => m.sourceIds.includes(s.id));
  return (
    <ModalFrame
      title={s.title}
      eyebrow="EVIDENCE REVIEW"
      onClose={onClose}
      wide
    >
      <div className="source-dialog-summary">
        <Badge status={sourceStatus(s, state.serverTime)} />
        <span className="tiny-pill">
          {s.fixture
            ? "FICTIONAL DEMO EVIDENCE"
            : s.latest?.provider.toUpperCase() || "LIVE SOURCE"}
        </span>
        <span className="muted small-text">
          {linked.length} dependent{" "}
          {linked.length === 1 ? "mission" : "missions"}
        </span>
        {!s.fixture && s.kind !== "record" && (
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Original source <ExternalLink size={13} />
          </a>
        )}
      </div>
      {!s.fixture && s.kind !== "record" && (
        <div className="capture-controls">
          <label>
            Capture provider
            <select
              value={captureProvider}
              onChange={(event) =>
                setCaptureProvider(event.target.value as "direct" | "anakin")
              }
            >
              <option value="direct">Direct government source</option>
              <option value="anakin">Anakin API</option>
            </select>
          </label>
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => onCapture(captureProvider)}
          >
            <RefreshCw size={16} />
            {s.latest ? "Capture latest version" : "Capture source"}
          </button>
          <p className="field-help">
            Keep the current source text, timestamp and provider together.
            Capture again to recover from a failed or outdated check.
          </p>
        </div>
      )}
      {s.kind === "record" && (
        <div className="record-notice">
          <FileText size={17} />
          <p>
            Operator-supplied evidence · {s.reference}
            <br />
            {s.validUntil
              ? `Declared expiry: ${date(s.validUntil)}`
              : "No declared expiry; freshness window still applies."}{" "}
            · Issuer authenticity is not verified.
          </p>
          <button className="text-button" onClick={onEditRecord}>
            Update record
          </button>
        </div>
      )}
      {s.lastError && (
        <div className="callout error">
          <TriangleAlert size={17} />
          <p>
            Capture unavailable: {s.lastError}. The earlier snapshot is
            preserved, but it cannot silently stand in for a current check.
          </p>
        </div>
      )}
      {!s.fixture && s.kind !== "record" && (
        <div className="monitor-control">
          <h3>Keep this source current</h3>
          <p>
            Opt in to scheduled captures. Changed pages invalidate dependent
            signoffs. Failed checks place work on hold.
          </p>
          <div className="monitor-options">
            <label>
              Check interval
              <select
                value={interval}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
              >
                {[1, 3, 6, 12, 24, 48, 168].map((n) => (
                  <option value={n} key={n}>
                    Every {n} hours
                  </option>
                ))}
              </select>
            </label>
            <label>
              Provider
              <select
                value={monitorProvider}
                onChange={(e) =>
                  setMonitorProvider(e.target.value as typeof monitorProvider)
                }
              >
                <option value="direct">Direct government source</option>
                <option value="anakin">Anakin API</option>
              </select>
            </label>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() =>
                onMonitor({
                  enabled: !s.monitor?.enabled,
                  intervalHours: interval,
                  provider: monitorProvider,
                })
              }
            >
              {s.monitor?.enabled ? "Pause monitoring" : "Enable monitoring"}
            </button>
          </div>
          <small>
            {s.monitor?.enabled
              ? `Next check: ${s.monitor.nextCaptureAt ? date(s.monitor.nextCaptureAt) : "queued"}. Failures use a capped retry delay.`
              : "Monitoring is off. Anakin captures use provider credits when enabled."}
          </small>
        </div>
      )}
      {s.latest ? (
        <>
          <div className={`snapshot-grid ${s.previous ? "" : "single"}`}>
            {s.previous && (
              <div className="snapshot previous">
                <div className="snapshot-title">
                  <span>Previous capture</span>
                  <time>{date(s.previous.capturedAt)}</time>
                </div>
                <pre>{s.previous.content}</pre>
                <div className="hash-row">
                  <span>SHA-256</span>
                  <code>{s.previous.hash}</code>
                </div>
              </div>
            )}
            <div className="snapshot current">
              <div className="snapshot-title">
                <span>Current capture</span>
                <time>{date(s.latest.capturedAt)}</time>
              </div>
              <pre>{s.latest.content}</pre>
              <div className="hash-row">
                <span>SHA-256</span>
                <code>{s.latest.hash}</code>
              </div>
            </div>
          </div>
          <SourceHistory
            key={s.latest.id}
            sourceId={s.id}
            currentHash={s.latest.hash}
          />
          <div className="linked-missions">
            <span className="eyebrow">DEPENDENT WORK</span>
            <div>
              {linked.map((m) => (
                <button
                  key={m.id}
                  className="dependent-mission"
                  onClick={() => onMission(m)}
                >
                  {m.name}
                  <Badge status={m.assessment.status} />
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
            {!linked.length && (
              <p className="muted small-text">
                No missions depend on this source yet.
              </p>
            )}
          </div>
          <form
            className="review-form"
            onSubmit={(e) => {
              e.preventDefault();
              onReview({ expectedHash: reviewHash, decision, note });
            }}
          >
            <h3>Your evidence decision</h3>
            {reviewIssue && (
              <p className="inline-error" role="status">
                {reviewIssue}
              </p>
            )}
            {reviewOutdated && (
              <div className="callout">
                <TriangleAlert size={17} />
                <p>
                  The source changed while this review was open. Inspect the new
                  content, then start a fresh decision.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setReviewHash(s.latest?.hash);
                    setNote("");
                    setDecision("blocked");
                  }}
                >
                  Review updated version
                </button>
              </div>
            )}
            <p className="muted small-text">
              Accept only after you have checked that the captured evidence
              supports your operating requirements. Recording a hold keeps
              dependent work blocked.
            </p>
            <div className="decision-options">
              <label className={decision === "blocked" ? "selected" : ""}>
                <input
                  type="radio"
                  name="decision"
                  value="blocked"
                  checked={decision === "blocked"}
                  onChange={() => setDecision("blocked")}
                />
                <ShieldOff size={18} />
                <div>
                  <strong>Keep on hold</strong>
                  <span>Evidence does not support this work</span>
                </div>
              </label>
              <label className={decision === "accepted" ? "selected" : ""}>
                <input
                  type="radio"
                  name="decision"
                  value="accepted"
                  checked={decision === "accepted"}
                  onChange={() => setDecision("accepted")}
                />
                <FileCheck2 size={18} />
                <div>
                  <strong>Accept evidence</strong>
                  <span>Record a checked, current source</span>
                </div>
              </label>
            </div>
            <label>
              Review note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                minLength={8}
                maxLength={2000}
                rows={3}
                placeholder="What did you check, and why does it support your decision?"
              />
            </label>
            <div className="form-footer">
              <span>
                <LockKeyhole size={13} /> Decision is bound to this captured
                version
              </span>
              <button
                className="button primary"
                disabled={!!busy || reviewOutdated || !!reviewIssue}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}{" "}
                Record decision
              </button>
            </div>
          </form>
        </>
      ) : (
        <Empty
          title="No evidence captured yet"
          body="Capture the public page to preserve a timestamped version for review."
        />
      )}
    </ModalFrame>
  );
}
function MissionDialog({
  mission: m,
  state,
  busy,
  onClose,
  onApprove,
  onSource,
  onExport,
  onEdit,
  onPrint,
}: {
  mission: Mission;
  state: AppState;
  busy: string;
  onClose: () => void;
  onApprove: (body: unknown) => void;
  onSource: (s: EvidenceSource) => void;
  onExport: () => void;
  onEdit: () => void;
  onPrint: () => void;
}) {
  const [note, setNote] = useState("");
  const [reviewRevision, setReviewRevision] = useState(m.revision ?? 0);
  const [boundHashes, setBoundHashes] = useState(() =>
    Object.fromEntries(
      m.sourceIds.map((id) => [
        id,
        state.sources.find((s) => s.id === id)?.latest?.hash,
      ]),
    ),
  );
  const sources = m.sourceIds
    .map((id) => state.sources.find((s) => s.id === id))
    .filter((s): s is EvidenceSource => !!s);
  const missionOutdated =
    reviewRevision !== (m.revision ?? 0) ||
    m.sourceIds.some(
      (id) =>
        boundHashes[id] !==
        state.sources.find((s) => s.id === id)?.latest?.hash,
    );
  const evidenceValid =
    sources.length === m.sourceIds.length &&
    sources.every((s) => sourceStatus(s, state.serverTime) === "ready") &&
    !m.assessment.issues.some((issue) =>
      ["missing", "stale", "blocked", "unavailable"].includes(issue.code),
    );
  return (
    <ModalFrame
      title={m.name}
      eyebrow="MISSION DECISION RECORD"
      onClose={onClose}
      wide
    >
      <div className="mission-dialog-top">
        <Badge status={m.assessment.status} />
        <span>{m.client}</span>
        <button className="text-button" onClick={onEdit}>
          Edit mission
        </button>
        <button className="text-button" onClick={onPrint}>
          Print report
        </button>
        <button className="button secondary" onClick={onExport}>
          <ArrowDownToLine size={15} /> Export decision packet
        </button>
      </div>
      <div className="mission-facts">
        <div>
          <span>Operating site</span>
          <strong>{state.sites.find((s) => s.id === m.siteId)?.name}</strong>
        </div>
        <div>
          <span>Scheduled · your local time</span>
          <strong>{date(m.scheduledAt)}</strong>
        </div>
        <div>
          <span>Booked job value</span>
          <strong>{money(m.value)}</strong>
        </div>
      </div>
      {m.assessment.issues.length > 0 && (
        <div className="issues-box">
          <h3>
            <TriangleAlert size={17} /> Why this mission needs attention
          </h3>
          {m.assessment.issues.map((i, n) => (
            <p key={n}>
              <span className="tiny-pill">{i.code.toUpperCase()}</span>
              {i.message}
            </p>
          ))}
        </div>
      )}
      <h3 className="section-small-title">
        Evidence dependencies{" "}
        <span>
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </h3>
      <div className="mission-sources">
        {sources.map((s) => (
          <button key={s.id} onClick={() => onSource(s)}>
            <Globe2 size={18} />
            <div>
              <strong>{s.title}</strong>
              <small>
                {s.latest
                  ? `${s.latest.hash.slice(0, 14)} · ${s.latest.provider} · ${date(s.latest.capturedAt)}`
                  : "No snapshot captured"}
              </small>
            </div>
            <Badge status={sourceStatus(s, state.serverTime)} />
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      {m.approval && (
        <div className="approval-record">
          <div className="source-icon">
            <FileCheck2 size={21} />
          </div>
          <div>
            <h3>Latest recorded signoff</h3>
            <p>
              {m.approval.actor} · {date(m.approval.at)}
            </p>
            <blockquote>{m.approval.note}</blockquote>
            <small>
              {m.assessment.status === "ready"
                ? "The reviewed source versions still match this signoff."
                : "This historical signoff does not release the current work."}
            </small>
          </div>
        </div>
      )}
      <form
        className="review-form"
        onSubmit={(e) => {
          e.preventDefault();
          onApprove({
            expectedHashes: boundHashes,
            expectedRevision: reviewRevision,
            note,
          });
        }}
      >
        <h3>
          {m.approval
            ? "Record a fresh signoff"
            : "Complete the operational review"}
        </h3>
        {missionOutdated && (
          <div className="callout">
            <TriangleAlert size={17} />
            <p>
              This mission or its evidence changed while you were reviewing.
              Review the current details before signing.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setReviewRevision(m.revision ?? 0);
                setBoundHashes(
                  Object.fromEntries(
                    sources.map((s) => [s.id, s.latest?.hash]),
                  ),
                );
                setNote("");
              }}
            >
              Review current details
            </button>
          </div>
        )}
        <p className="muted small-text">
          This signs off the linked evidence review only. The operator is
          responsible for permissions, airspace, weather, aircraft, and
          preflight checks.
        </p>
        <label>
          Signoff note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={8}
            maxLength={2000}
            required
            rows={2}
            placeholder="Record what you checked for this mission."
          />
        </label>
        <div className="form-footer">
          <span>
            {evidenceValid ? (
              <>
                <ShieldCheck size={14} /> Evidence is eligible for signoff
              </>
            ) : (
              <>
                <TriangleAlert size={14} /> Resolve the source issues before
                signoff
              </>
            )}
          </span>
          <button
            className="button primary"
            disabled={!!busy || !evidenceValid || missionOutdated}
          >
            <CheckCheck size={16} /> Sign off current evidence
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
function CreateSite({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: unknown) => void;
}) {
  return (
    <ModalFrame
      title="Add an operating site"
      eyebrow="SITE REGISTER"
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          onSubmit({ ...f, lat: Number(f.lat), lon: Number(f.lon) });
        }}
      >
        <label>
          Site name
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="Harbor inspection yard"
          />
        </label>
        <label>
          Address or site description
          <input
            name="address"
            required
            minLength={3}
            maxLength={300}
            placeholder="Street address or an internal site reference"
          />
        </label>
        <div className="form-columns">
          <label>
            Latitude
            <input
              name="lat"
              type="number"
              required
              step="any"
              min="-90"
              max="90"
              placeholder="42.36"
            />
          </label>
          <label>
            Longitude
            <input
              name="lon"
              type="number"
              required
              step="any"
              min="-180"
              max="180"
              placeholder="-71.06"
            />
          </label>
        </div>
        <p className="muted small-text">
          Coordinates identify the site; they do not define an authorized flight
          area.
        </p>
        <button className="button primary" disabled={busy}>
          <Plus size={16} /> Create site
        </button>
      </form>
    </ModalFrame>
  );
}
function CreateSource({
  state,
  busy,
  onClose,
  onSubmit,
  onRecord,
}: {
  state: AppState;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: unknown) => void;
  onRecord: (b: unknown) => void;
}) {
  const [kind, setKind] = useState<"web" | "record">("web");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  return (
    <ModalFrame
      title="Connect an evidence source"
      eyebrow="SOURCE REGISTER"
      onClose={onClose}
    >
      <div className="source-kind-tabs">
        <button
          className={kind === "web" ? "active" : ""}
          onClick={() => setKind("web")}
        >
          <Globe2 size={16} /> Public web source
        </button>
        <button
          className={kind === "record" ? "active" : ""}
          onClick={() => setKind("record")}
        >
          <FileText size={16} /> Operator record
        </button>
      </div>
      {kind === "record" ? (
        <RecordForm state={state} busy={busy} onSubmit={onRecord} />
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            onSubmit({
              ...f,
              siteId: f.siteId || null,
              freshnessHours: Number(f.freshnessHours),
            });
          }}
        >
          <div className="source-example">
            <span>Try a live official source</span>
            <button
              type="button"
              onClick={() => {
                setUrl(
                  "https://www.faa.gov/uas/getting_started/where_can_i_fly",
                );
                setTitle("FAA · Where can I fly?");
              }}
            >
              FAA operating reference <ArrowUpRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setUrl(
                  "https://www.boston.gov/departments/tourism-sports-and-entertainment/how-apply-film-boston",
                );
                setTitle("City of Boston · Film permits");
              }}
            >
              Boston filming requirements <ArrowUpRight size={13} />
            </button>
          </div>
          <label>
            Source title
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={160}
              placeholder="Property access requirements"
            />
          </label>
          <label>
            Public source URL
            <input
              name="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://www.faa.gov/..."
            />
          </label>
          <p className="field-help">
            Live capture supports HTTPS pages on faa.gov, nps.gov, boston.gov,
            and mass.gov.
          </p>
          <div className="form-columns">
            <label>
              Category
              <select name="category">
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Freshness window (hours)
              <input
                name="freshnessHours"
                type="number"
                defaultValue={24}
                min="1"
                max="720"
                required
              />
            </label>
          </div>
          <label>
            Associated site
            <select name="siteId">
              <option value="">Workspace-wide reference</option>
              {state.sites.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            <Plus size={16} /> Add evidence source
          </button>
        </form>
      )}
    </ModalFrame>
  );
}
function RecordForm({
  state,
  busy,
  onSubmit,
  source,
}: {
  state: AppState;
  busy: boolean;
  onSubmit: (b: unknown) => void;
  source?: EvidenceSource;
}) {
  const initialContent =
    source?.latest?.content.split("\n\n").slice(1).join("\n\n") || "";
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        const body = {
          ...f,
          validUntil: f.validUntil
            ? new Date(f.validUntil as string).toISOString()
            : null,
        };
        onSubmit(
          source
            ? { ...body, expectedHash: source.latest?.hash }
            : {
                ...body,
                siteId: f.siteId || null,
                freshnessHours: Number(f.freshnessHours),
              },
        );
      }}
    >
      <div className="record-notice">
        <FileText size={17} />
        <p>
          Record an excerpt from permission or insurance evidence you hold. Keep
          the original document in your own records. GroundProof preserves your
          submission and review; it does not authenticate the issuer or verify
          coverage.
        </p>
      </div>
      {!source && (
        <>
          <label>
            Record title
            <input
              name="title"
              required
              minLength={3}
              maxLength={160}
              placeholder="Written access permission · Harbor site"
            />
          </label>
          <div className="form-columns">
            <label>
              Category
              <select name="category">
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Review freshness (hours)
              <input
                name="freshnessHours"
                type="number"
                defaultValue={168}
                min="1"
                max="8760"
                required
              />
            </label>
          </div>
          <label>
            Associated site
            <select name="siteId">
              <option value="">Workspace-wide reference</option>
              {state.sites.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Original document reference
        <input
          name="reference"
          defaultValue={source?.reference}
          minLength={3}
          maxLength={300}
          required
          placeholder="Permit ID, issuer, date, or your document reference"
        />
      </label>
      <label>
        Evidence excerpt
        <textarea
          name="content"
          defaultValue={initialContent}
          required
          minLength={50}
          maxLength={20000}
          rows={7}
          placeholder="Paste the conditions and scope you are relying on. Include the relevant site, authorized activity, restrictions, and dates."
        />
      </label>
      <label>
        Declared valid until (optional, your local time)
        <input
          name="validUntil"
          type="datetime-local"
          defaultValue={
            source?.validUntil
              ? new Date(
                  Date.parse(source.validUntil) -
                    new Date(source.validUntil).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : undefined
          }
        />
      </label>
      <p className="field-help">
        A known expiry is checked against the scheduled mission time. Editing a
        record invalidates prior signoffs and requires a fresh review.
      </p>
      <button className="button primary" disabled={busy}>
        <FileCheck2 size={16} />
        {source ? "Save a new record version" : "Create operator record"}
      </button>
    </form>
  );
}
function CreateMission({
  state,
  busy,
  onClose,
  onSubmit,
  onSite,
  onSource,
  initial,
}: {
  state: AppState;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: unknown) => void;
  onSite: () => void;
  onSource: () => void;
  initial?: Mission;
}) {
  const [ids, setIds] = useState<string[]>(initial?.sourceIds || []);
  const [siteId, setSiteId] = useState(
    initial?.siteId ?? state.sites[0]?.id ?? "",
  );
  if (!state.sites.length || !state.sources.length)
    return (
      <ModalFrame
        title="Set up your first mission"
        eyebrow="A CONNECTED WORKFLOW"
        onClose={onClose}
      >
        <Empty
          title={
            !state.sites.length
              ? "Start with an operating site"
              : "Add the evidence your team checks"
          }
          body={
            !state.sites.length
              ? "Each mission belongs to a registered site. Add a site, then connect its evidence."
              : "Your first mission needs at least one source to review. Capture and review it before signoff."
          }
          action={
            <button
              className="button primary"
              onClick={!state.sites.length ? onSite : onSource}
            >
              <Plus size={16} />
              {!state.sites.length ? "Add a site" : "Add evidence source"}
            </button>
          }
        />
      </ModalFrame>
    );
  return (
    <ModalFrame
      title={
        initial ? "Update mission details" : "Plan a mission with evidence"
      }
      eyebrow={initial ? "MISSION EDIT" : "NEW MISSION"}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ids.length) return;
          const f = Object.fromEntries(new FormData(e.currentTarget));
          onSubmit({
            ...f,
            scheduledAt: new Date(f.scheduledAt as string).toISOString(),
            value: Number(f.value),
            sourceIds: ids,
            ...(initial ? { expectedRevision: initial.revision ?? 0 } : {}),
          });
        }}
      >
        <label>
          Mission name
          <input
            name="name"
            defaultValue={initial?.name}
            required
            minLength={3}
            maxLength={160}
            placeholder="North facade thermal inspection"
          />
        </label>
        <div className="form-columns">
          <label>
            Client
            <input
              name="client"
              defaultValue={initial?.client}
              required
              minLength={2}
              maxLength={120}
              placeholder="Client or internal team"
            />
          </label>
          <label>
            Booked value ($)
            <input
              name="value"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              defaultValue={initial?.value || 0}
            />
          </label>
        </div>
        <label>
          Operating site
          <select
            name="siteId"
            value={siteId}
            onChange={(event) => {
              const next = event.target.value;
              setSiteId(next);
              setIds((previous) =>
                previous.filter((id) => {
                  const source = state.sources.find((item) => item.id === id);
                  return source && (!source.siteId || source.siteId === next);
                }),
              );
            }}
            required
          >
            {state.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scheduled time (your local timezone)
          <input
            name="scheduledAt"
            type="datetime-local"
            defaultValue={
              initial
                ? new Date(
                    Date.parse(initial.scheduledAt) -
                      new Date(initial.scheduledAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : undefined
            }
            required
          />
        </label>
        <fieldset className="evidence-picker">
          <legend>
            Required evidence{" "}
            <span>Choose every source this mission depends on</span>
          </legend>
          {state.sources
            .filter((source) => !source.siteId || source.siteId === siteId)
            .map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(s.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, s.id]
                        : ids.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>
                  {s.title}
                  <small>{categoryLabels[s.category]}</small>
                </span>
              </label>
            ))}
        </fieldset>
        <p className="field-help" aria-live="polite">
          {ids.length
            ? `${ids.length} required ${ids.length === 1 ? "source selected" : "sources selected"}. Each source needs a current review before mission signoff.`
            : "Select at least one required source. Only workspace-wide evidence and evidence for this site are shown."}
        </p>
        <button className="button primary" disabled={busy || !ids.length}>
          <Plus size={16} />
          {initial ? "Save changes" : "Create mission"}
        </button>
      </form>
    </ModalFrame>
  );
}
