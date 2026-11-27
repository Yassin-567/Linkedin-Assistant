"use client";

import { useState } from "react";

export type JsonImportValidation = { value: unknown; error?: string };
type Props = {
  title: string;
  description: string;
  prompt: string;
  placeholder?: string;
  importLabel?: string;
  validate: (value: unknown) => JsonImportValidation;
  onImport: (value: unknown) => Promise<string | void> | string | void;
};

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const lines = trimmed.split(/\r?\n/);
  const fence = String.fromCharCode(96).repeat(3);
  const opening = lines[0]?.trim().toLowerCase() || "";
  const closing = lines[lines.length - 1]?.trim() || "";
  if (lines.length >= 3 && (opening === fence || opening === fence + "json") && closing === fence) {
    return lines.slice(1, -1).join("\n").trim();
  }
  return trimmed;
}

export default function JsonImportPanel({
  title, description, prompt, placeholder = "Paste the JSON returned by ChatGPT here…",
  importLabel = "Import", validate, onImport
}: Props) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState("");
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function validateInput(): unknown | null {
    setError("");
    setMessage("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch {
      setValidated(false);
      setPreview("");
      setError("Could not parse this JSON. Paste one complete JSON object, optionally inside a single fenced code block.");
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setValidated(false);
      setPreview("");
      setError("The import must be one JSON object, not an array or a single value.");
      return null;
    }
    const result = validate(parsed);
    if (result.error) {
      setValidated(false);
      setPreview("");
      setError(result.error);
      return null;
    }
    setPreview(JSON.stringify(result.value, null, 2) ?? "");
    setValidated(true);
    return result.value;
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("Prompt copied. Paste it into ChatGPT.");
      setError("");
    } catch {
      setError("Could not copy automatically. Select the prompt text above and copy it.");
    }
  }

  async function importJson() {
    const value = validateInput();
    if (value === null) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await onImport(value);
      setMessage(typeof result === "string" && result ? result : "Import completed.");
      setRaw("");
      setPreview("");
      setValidated(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed. Please review the JSON and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel json-import-panel">
    <div className="section-heading">
      <div><h2>{title}</h2><p className="muted">{description}</p></div>
      <button type="button" className="secondary" onClick={() => void copyPrompt()}>Copy prompt</button>
    </div>
    <label className="wide">ChatGPT prompt
      <textarea rows={5} readOnly value={prompt} onFocus={event => event.currentTarget.select()} />
    </label>
    <label className="wide">Paste JSON
      <textarea rows={7} value={raw} onChange={event => {
        setRaw(event.target.value);
        setValidated(false);
        setPreview("");
        setError("");
        setMessage("");
      }} placeholder={placeholder} />
    </label>
    <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
      <button type="button" className="secondary" onClick={() => void validateInput()} disabled={!raw.trim() || busy}>Validate and preview</button>
      <button type="button" onClick={() => void importJson()} disabled={!validated || busy}>{busy ? "Importing…" : importLabel}</button>
    </div>
    {preview && <div className="json-import-preview">
      <strong>Validated preview</strong>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 280, overflow: "auto" }}>{preview}</pre>
    </div>}
    {error && <p className="status error" role="alert">{error}</p>}
    {message && <p className="status" role="status">{message}</p>}
  </section>;
}