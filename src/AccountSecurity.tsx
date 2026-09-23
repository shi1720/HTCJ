import { useState, type FormEvent } from "react";
import {
  Copy,
  Download,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
} from "lucide-react";
import { api } from "./api";

export function RecoveryKey({
  recoveryKey,
  onDone,
}: {
  recoveryKey: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <div className="form-stack recovery-key-panel">
      <p>
        Save this key in your password manager. It lets you recover your account
        if you lose your password. This full key will not be shown again.
      </p>
      <label>
        Account recovery key
        <textarea
          readOnly
          value={recoveryKey}
          rows={3}
          autoComplete="off"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <div className="button-row">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(recoveryKey);
              setCopied(true);
              setCopyError(false);
            } catch {
              setCopyError(true);
            }
          }}
        >
          <Copy size={16} />
          {copied ? "Key copied" : "Copy recovery key"}
        </button>
        <button
          className="button secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  `GroundProof account recovery key\n\n${recoveryKey}\n\nStore privately. This one-use key grants account access together with your email. Recovering your account replaces it with a new key.\n`,
                ],
                { type: "text/plain" },
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "groundproof-recovery-key.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={16} />
          Download key
        </button>
      </div>
      {copyError && (
        <p role="status" className="field-help">
          Clipboard access is unavailable. Select the key above and copy it, or
          download the file.
        </p>
      )}
      <p className="field-help">
        Keep this key private. Each successful recovery uses it once and creates
        a replacement. GroundProof does not send password reset emails.
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved my recovery key somewhere private
      </label>
      <button className="button primary" disabled={!saved} onClick={onDone}>
        Continue to workspace
      </button>
    </div>
  );
}

export function AccountSecurity({
  onRecoveryKey,
  onSignedOut,
}: {
  onRecoveryKey: (key: string) => void;
  onSignedOut: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: "password" | "recovery-key",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setBusy(kind);
    setMessage(null);
    try {
      const result = await api<{ recoveryKey?: string }>(`/auth/${kind}`, body);
      form.reset();
      if (result.recoveryKey) onRecoveryKey(result.recoveryKey);
      setMessage({
        text:
          kind === "password"
            ? "Password changed. Other signed-in sessions have been ended."
            : "A new recovery key has replaced your old key.",
        error: false,
      });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel settings-panel security-panel">
      <span className="eyebrow">ACCOUNT SECURITY</span>
      <h2>Keep control of your workspace.</h2>
      <p className="muted small-text">
        Change your password, replace a recovery key, or end signed-in sessions.
      </p>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "inline-error" : "inline-success"}
        >
          {message.text}
        </p>
      )}
      <details>
        <summary>
          <LockKeyhole size={17} />
          Change password
        </summary>
        <form
          className="form-stack"
          onSubmit={(event) => submit(event, "password")}
        >
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              placeholder="At least 12 characters"
            />
          </label>
          <button className="button primary" disabled={!!busy}>
            {busy === "password" && <Loader2 className="spin" size={16} />}
            Update password
          </button>
        </form>
      </details>
      <details>
        <summary>
          <KeyRound size={17} />
          Replace recovery key
        </summary>
        <p className="small-text muted">
          Use this if you have lost your saved key or think someone else has it.
          Your previous key will stop working.
        </p>
        <form
          className="form-stack"
          onSubmit={(event) => submit(event, "recovery-key")}
        >
          <label>
            Confirm current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button secondary" disabled={!!busy}>
            Generate new recovery key
          </button>
        </form>
      </details>
      <details>
        <summary>
          <LogOut size={17} />
          Manage signed-in sessions
        </summary>
        <p className="small-text muted">
          End all browser sessions, including this one. You can sign in again
          with your password.
        </p>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={async () => {
            setBusy("sessions");
            try {
              await api("/auth/logout-all", {});
              onSignedOut();
            } catch (error) {
              setMessage({ text: (error as Error).message, error: true });
            } finally {
              setBusy("");
            }
          }}
        >
          Sign out everywhere
        </button>
      </details>
    </section>
  );
}
