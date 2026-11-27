"use client";

import { useMemo, useState } from "react";

type ImportKind = "jobs" | "linkedin";
type Parsed = { kind: ImportKind; preferences: Record<string, unknown> };

const MAX_ITEM_LENGTH = 180;

const JOB_PROMPT = [
  "Create an Inlinked Job Preferences JSON import from information I have explicitly provided in this conversation.",
  "",
  "Return exactly one valid JSON object inside a single fenced code block (```json ... ```) so I can use the copy button, with no text before or after the code block and no splitting across several blocks, never as plain text or a file download.",
  "Do not invent preferences. Use only clear statements I have made about the roles, location, work arrangements, salary, seniority, employment type, exclusions and search sources I want.",
  "For anything I have not specified, use an empty array, empty string or null as appropriate. Do not infer a salary, location, employment type or work mode from my CV.",
  "Use concise list items. Every list item must be non-empty and no longer than 180 characters.",
  "Use only these workModes values: remote, hybrid, on-site.",
  "minimumSalary must be a non-negative number or null. Leave it null when no minimum has been specified.",
  "Only include a source toggle when I have explicitly set it. Use an empty language string when no language preference was given.",
  "",
  "Exact JSON shape:",
  "{",
  '  "schema": "inlinked.job-preferences.v1",',
  '  "preferences": {',
  '    "targetRoles": [],',
  '    "keywords": [],',
  '    "countries": [],',
  '    "locations": [],',
  '    "workModes": [],',
  '    "employmentTypes": [],',
  '    "seniorityLevels": [],',
  '    "excludedKeywords": [],',
  '    "salaryCurrency": "",',
  '    "minimumSalary": null,',
  '    "language": ""',
  "  }",
  "}",
  "",
  "List limits: targetRoles 80 items; keywords 100; countries 40; locations 100; workModes 3; employmentTypes 30; seniorityLevels 30; excludedKeywords 100.",
  "Return only the single fenced JSON code block. Keep unspecified fields at the defaults shown; Inlinked will merge non-empty values into the saved preferences."
].join("\n");

const LINKEDIN_PROMPT = [
  "Create an Inlinked LinkedIn Search Preferences JSON import from information I have explicitly provided in this conversation.",
  "",
  "Return exactly one valid JSON object inside a single fenced code block (```json ... ```) so I can use the copy button, with no text before or after the code block and no splitting across several blocks, never as plain text or a file download.",
  "Extract preferences for finding other professionals and decision-makers, not my own previous job titles.",
  "Use only target countries, industries, keywords, decision-maker job titles, exclusions and language that I have clearly stated. Do not invent target markets or assume that my work history is a target market.",
  "Every list item must be non-empty and no longer than 180 characters. Keep items concise and remove duplicates.",
  "Only include linkedinProfileUrl if I have explicitly supplied my own public LinkedIn personal profile URL. Do not guess it.",
  "profileSummary may briefly describe my professional background when that information is supported by the conversation. Do not add private contact details.",
  "",
  "Exact JSON shape:",
  "{",
  '  "schema": "inlinked.linkedin-preferences.v1",',
  '  "preferences": {',
  '    "linkedinProfileUrl": "",',
  '    "countries": [],',
  '    "industries": [],',
  '    "keywords": [],',
  '    "jobTitles": [],',
  '    "excludedKeywords": [],',
  '    "language": "",',
  '    "profileSummary": ""',
  "  }",
  "}",
  "",
  "List limits: countries 30 items; industries 50; keywords 100; jobTitles 50; excludedKeywords 100.",
  "Return JSON only. Keep fields empty when I have not provided enough information; Inlinked will merge non-empty values into the saved preferences."
].join("\n");

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const newlineIndex = trimmed.indexOf("\\n");
  const openingLine = newlineIndex >= 0
    ? trimmed.slice(0, newlineIndex).replace(/\\r$/, "").trim().toLowerCase()
    : "";
  if (openingLine !== "```json" || !trimmed.endsWith("```")) return trimmed;
  return trimmed.slice(newlineIndex + 1, -3).trim();
}

function parseRoot(raw: string, expectedSchema: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(stripJsonCodeFence(raw));
  } catch {
    throw new Error("That is not valid JSON. Paste the complete JSON object, optionally inside one fenced JSON code block.");
  }
  const root = asObject(value, "The JSON");
  if (root.schema !== expectedSchema) {
    throw new Error('The schema must be "' + expectedSchema + '". Copy the matching Inlinked prompt and try again.');
  }
  return root;
}

function listValue(value: unknown, label: string, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(label + " must contain no more than " + maxItems + " items.");
  }
  if (!value.every(item =>
    typeof item === "string" &&
    item.trim().length > 0 &&
    item.trim().length <= MAX_ITEM_LENGTH
  )) {
    throw new Error(label + " must contain non-empty text items of " + MAX_ITEM_LENGTH + " characters or fewer.");
  }
  return Array.from(new Set(value.map(item => (item as string).trim())));
}

function optionalText(value: unknown, label: string, max = 4000): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > max) {
    throw new Error(label + " must be text of " + max + " characters or fewer.");
  }
  return value.trim();
}

function parseImport(raw: string, kind: ImportKind): Parsed {
  if (kind === "jobs") {
    const root = parseRoot(raw, "inlinked.job-preferences.v1");
    const input = asObject(root.preferences, "preferences");
    const workModes = listValue(input.workModes, "workModes", 3);
    if (!workModes.every(item => ["remote", "hybrid", "on-site"].includes(item))) {
      throw new Error("workModes may contain only remote, hybrid or on-site.");
    }
    const minimumSalary = input.minimumSalary === undefined || input.minimumSalary === null || input.minimumSalary === ""
      ? undefined
      : Number(input.minimumSalary);
    if (minimumSalary !== undefined && (!Number.isFinite(minimumSalary) || minimumSalary < 0)) {
      throw new Error("minimumSalary must be a non-negative number or null.");
    }
    const result: Record<string, unknown> = {
      targetRoles: listValue(input.targetRoles, "targetRoles", 80),
      keywords: listValue(input.keywords, "keywords", 100),
      countries: listValue(input.countries, "countries", 40),
      locations: listValue(input.locations, "locations", 100),
      employmentTypes: listValue(input.employmentTypes, "employmentTypes", 30),
      seniorityLevels: listValue(input.seniorityLevels, "seniorityLevels", 30),
      excludedKeywords: listValue(input.excludedKeywords, "excludedKeywords", 100)
    };
    if (workModes.length > 0) result.workModes = workModes;
    const currency = optionalText(input.salaryCurrency, "salaryCurrency", 10);
    const language = optionalText(input.language, "language", 60);
    if (currency !== undefined) result.salaryCurrency = currency.toUpperCase();
    if (language !== undefined && language) result.language = language;
    if (minimumSalary !== undefined) result.minimumSalary = minimumSalary;
    if (!Object.values(result).some(value => Array.isArray(value) ? value.length > 0 : value !== "" && value !== null)) {
      throw new Error("The JSON contains no job preference values to import.");
    }
    return { kind, preferences: result };
  }

  const root = parseRoot(raw, "inlinked.linkedin-preferences.v1");
  const input = asObject(root.preferences, "preferences");
  const result: Record<string, unknown> = {
    countries: listValue(input.countries, "countries", 30),
    industries: listValue(input.industries, "industries", 50),
    keywords: listValue(input.keywords, "keywords", 100),
    jobTitles: listValue(input.jobTitles, "jobTitles", 50),
    excludedKeywords: listValue(input.excludedKeywords, "excludedKeywords", 100)
  };
  const profileUrl = optionalText(input.linkedinProfileUrl, "linkedinProfileUrl", 1000);
  if (profileUrl !== undefined && profileUrl) {
    try {
      const url = new URL(profileUrl);
      if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || !url.pathname.toLowerCase().startsWith("/in/")) {
        throw new Error("linkedinProfileUrl must be a LinkedIn personal profile URL.");
      }
      result.linkedinProfileUrl = profileUrl;
    } catch (error) {
      if (error instanceof Error && error.message.includes("must be")) throw error;
      throw new Error("linkedinProfileUrl must be a valid LinkedIn personal profile URL.");
    }
  }
  const language = optionalText(input.language, "language", 60);
  const profileSummary = optionalText(input.profileSummary, "profileSummary", 4000);
  if (language !== undefined && language) result.language = language;
  if (profileSummary !== undefined) result.profileSummary = profileSummary;
  if (!Object.entries(result).some(([key, value]) =>
    ((key === "profileSummary" || key === "linkedinProfileUrl") && typeof value === "string" && value.trim().length > 0) ||
    (Array.isArray(value) && value.length > 0)
  )) {
    throw new Error("The JSON contains no LinkedIn preference values to import.");
  }
  return { kind, preferences: result };
}

function mergeLists(current: unknown, incoming: unknown, maxItems: number): string[] {
  const existing = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  const next = Array.isArray(incoming) ? incoming.filter((item): item is string => typeof item === "string") : [];
  return Array.from(new Set([...existing, ...next].map(item => item.trim()).filter(Boolean))).slice(0, maxItems);
}

function appendSummary(current: unknown, incoming: unknown): string {
  const existing = typeof current === "string" ? current.trim() : "";
  const addition = typeof incoming === "string" ? incoming.trim() : "";
  if (!addition || existing.includes(addition)) return existing.slice(0, 4000);
  return (existing + (existing ? "\n\n" : "") + addition).slice(0, 4000);
}

export default function JsonPreferencesImport() {
  const [kind, setKind] = useState<ImportKind>("jobs");
  const [jsonText, setJsonText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const prompt = useMemo(() => kind === "jobs" ? JOB_PROMPT : LINKEDIN_PROMPT, [kind]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("Prompt copied. Send it to ChatGPT with the relevant information, then paste its JSON response below.");
    } catch {
      setMessage("Clipboard access was blocked. Select and copy the prompt shown above.");
    }
  }

  function validate() {
    setMessage("");
    try {
      setParsed(parseImport(jsonText, kind));
      setMessage("JSON is valid. Review the extracted preferences before importing.");
    } catch (error) {
      setParsed(null);
      setMessage(error instanceof Error ? error.message : "Could not validate the JSON.");
    }
  }

  async function importPreferences() {
    if (!parsed || parsed.kind !== kind) return;
    setBusy("import");
    setMessage("");
    try {
      if (kind === "jobs") {
        const response = await fetch("/api/job-preferences", { cache: "no-store" });
        if (response.status === 401) { location.href = "/login"; return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load job preferences.");
        const current = data.preferences || {};
        const incoming = parsed.preferences;
        const payload = {
          ...current,
          targetRoles: mergeLists(current.targetRoles, incoming.targetRoles, 80),
          keywords: mergeLists(current.keywords, incoming.keywords, 100),
          countries: mergeLists(current.countries, incoming.countries, 40),
          locations: mergeLists(current.locations, incoming.locations, 100),
          workModes: incoming.workModes === undefined ? current.workModes : incoming.workModes,
          employmentTypes: mergeLists(current.employmentTypes, incoming.employmentTypes, 30),
          seniorityLevels: mergeLists(current.seniorityLevels, incoming.seniorityLevels, 30),
          excludedKeywords: mergeLists(current.excludedKeywords, incoming.excludedKeywords, 100),
          salaryCurrency: incoming.salaryCurrency || current.salaryCurrency || "",
          minimumSalary: incoming.minimumSalary === undefined ? current.minimumSalary : incoming.minimumSalary,
          language: incoming.language || current.language || "English",
          targetCount: incoming.targetCount === undefined ? current.targetCount : incoming.targetCount
        };
        const save = await fetch("/api/job-preferences", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const saved = await save.json();
        if (!save.ok) throw new Error(saved.error || "Could not save job preferences.");
      } else {
        const response = await fetch("/api/preferences", { cache: "no-store" });
        if (response.status === 401) { location.href = "/login"; return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load LinkedIn preferences.");
        const current = data.preferences || {};
        const incoming = parsed.preferences;
        const payload = {
          ...current,
          countries: mergeLists(current.countries, incoming.countries, 30),
          industries: mergeLists(current.industries, incoming.industries, 50),
          keywords: mergeLists(current.keywords, incoming.keywords, 100),
          jobTitles: mergeLists(current.jobTitles, incoming.jobTitles, 50),
          excludedKeywords: mergeLists(current.excludedKeywords, incoming.excludedKeywords, 100),
          linkedinProfileUrl: incoming.linkedinProfileUrl || current.linkedinProfileUrl || "",
          language: incoming.language || current.language || "English",
          profileSummary: appendSummary(current.profileSummary, incoming.profileSummary)
        };
        const save = await fetch("/api/preferences", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const saved = await save.json();
        if (!save.ok) throw new Error(saved.error || "Could not save LinkedIn preferences.");
      }
      setJsonText("");
      setParsed(null);
      setMessage("Import successful. Existing preferences were kept and the new values were added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy("");
    }
  }

  const listSummary = parsed
    ? Object.entries(parsed.preferences).filter(([, value]) => Array.isArray(value) && value.length > 0)
      .map(([key, value]) => key + ": " + (value as string[]).length).join(" · ")
    : "";

  return <section className="panel">
    <div className="section-heading">
      <div>
        <div className="eyebrow">PREFERENCE IMPORT</div>
        <h2>Import preferences from ChatGPT</h2>
        <p className="muted">Choose the settings to extract. ChatGPT returns copyable JSON text; no file download is needed.</p>
      </div>
    </div>
    <div className="lead-form">
      <label>Import type
        <select value={kind} onChange={event => { setKind(event.target.value as ImportKind); setJsonText(""); setParsed(null); setMessage(""); }}>
          <option value="jobs">Job preferences</option>
          <option value="linkedin">LinkedIn search preferences</option>
        </select>
      </label>
      <div className="wide">
        <strong>1. Copy this prompt into ChatGPT</strong>
        <pre className="prompt-box">{prompt}</pre>
        <button type="button" className="secondary" onClick={() => void copyPrompt()}>Copy prompt</button>
      </div>
      <label className="wide">2. Paste ChatGPT's JSON response
        <textarea rows={10} value={jsonText} onChange={event => { setJsonText(event.target.value); setParsed(null); setMessage(""); }}
          placeholder={'{\n  "schema": "inlinked.' + (kind === "jobs" ? "job-preferences" : "linkedin-preferences") + '.v1",\n  "preferences": { ... }\n}'} />
        <small className="muted">Paste the complete JSON object from ChatGPT, including its single fenced JSON code block if provided. Lists are limited to 180 characters per item and validated before import.</small>
      </label>
      <div className="wide row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={validate} disabled={!jsonText.trim()}>Validate and preview</button>
      </div>
    </div>
    {parsed && <section className="panel" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Review before importing</h3>
      <p>{listSummary || "Text preferences extracted."}</p>
      <p className="muted">Import mode: Merge. Existing values will be kept; duplicate items are removed.</p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={() => void importPreferences()} disabled={busy === "import"}>
          {busy === "import" ? "Importing..." : "Import preferences"}
        </button>
      </div>
    </section>}
    <p className="muted" role="status">{message}</p>
  </section>;
}
