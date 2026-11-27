"use client";

import { useState } from "react";

const CV_EXTRACTION_PROMPT = [
  "Analyze the attached CV PDF and extract professional information for my Inlinked preferences.",
  "",
  "Return exactly one valid JSON object inside a single fenced code block (```json ... ```) so I can use the copy button, with no text before or after the code block and no splitting across several blocks, never as plain text or a file download.",
  "",
  "Rules:",
  "- Use only information supported by the CV. Do not invent qualifications, tools, employers, dates, achievements, industries, or experience.",
  "- Keep the output focused on professional information. Ignore phone numbers, email addresses, home address, date of birth, ID numbers, photos, references, and other unnecessary personal details.",
  "- Normalize duplicate skills and equivalent job titles. Use concise, useful phrases.",
  "- jobPreferences.targetRoles should contain roles I have held and closely related roles that my demonstrated experience supports. These are suggested roles for me to review, not a claim that I have already chosen them.",
  "- jobPreferences.keywords should contain relevant skills, software, tools, responsibilities, and professional topics.",
  "- jobPreferences.seniorityLevels should be populated only when the CV clearly supports a level. Otherwise return an empty array.",
  "- leadPreferences.industries should contain industries in which the CV shows real experience. Do not present them as my confirmed target markets.",
  "- leadPreferences.keywords should contain professional skills, tools, services, and capabilities that could help describe the work I can offer to businesses.",
  "- leadPreferences.profileSummary should be a concise, accurate professional summary suitable as context for matching relevant business prospects.",
  "- Do not put my previous job titles into a lead decision-maker field. In Inlinked, lead job titles are the titles of people I want to find (for example Founder or Managing Director), not my own titles.",
  "- Do not infer target countries, cities, remote/hybrid/on-site preference, salary, employment type, exclusions, or prospect decision-maker titles from the CV. These settings should remain unchanged.",
  "- If something is unclear or absent, use an empty string or empty array. Do not guess.",
  "- Follow the exact item-count limits in the validator: experienceTitles 50, skills 100, tools 100, industries 50, certifications 50, languages 30, job targetRoles 80, job keywords 100, seniorityLevels 30, lead industries 50, lead keywords 100, and notes 30.",
  "- Every list item, including every note, must be a non-empty string of no more than 180 characters. Do not output longer items; shorten them without losing their meaning.",
  "",
  "Exact JSON schema:",
  "{",
  '  "schema": "inlinked.cv-import.v1",',
  '  "candidate": {',
  '    "professionalSummary": "",',
  '    "experienceTitles": [],',
  '    "skills": [],',
  '    "tools": [],',
  '    "industries": [],',
  '    "certifications": [],',
  '    "languages": []',
  "  },",
  '  "jobPreferences": {',
  '    "targetRoles": [],',
  '    "keywords": [],',
  '    "seniorityLevels": []',
  "  },",
  '  "leadPreferences": {',
  '    "industries": [],',
  '    "keywords": [],',
  '    "profileSummary": ""',
  "  },",
  '  "notes": []',
  "}",
  "",
  "All list values must be arrays of strings. Notes must contain no more than 30 items. Each list item and each note must be 180 characters or fewer. Use empty arrays or empty strings for unknown information. Return only the single fenced JSON code block and nothing else."
].join("\n");

type CvImportData = {
  candidate: {
    professionalSummary: string;
    experienceTitles: string[];
    skills: string[];
    tools: string[];
    industries: string[];
    certifications: string[];
    languages: string[];
  };
  jobPreferences: {
    targetRoles: string[];
    keywords: string[];
    seniorityLevels: string[];
  };
  leadPreferences: {
    industries: string[];
    keywords: string[];
    profileSummary: string;
  };
  notes: string[];
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be an object.");
  return value as Record<string, unknown>;
}

function textValue(value: unknown, label: string, max = 4000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(label + " must be a string.");
  if (value.length > max) throw new Error(label + " is too long.");
  return value.trim();
}

function listValue(value: unknown, label: string, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(label + " must be a list of no more than " + maxItems + " items.");
  if (!value.every(item => typeof item === "string" && item.trim().length > 0 && item.trim().length <= 180)) {
    throw new Error(label + " must contain non-empty text items of 180 characters or fewer.");
  }
  return Array.from(new Set(value.map(item => (item as string).trim())));
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\\x60{3}json[ \\t]*\\r?\\n?([\\s\\S]*?)\\r?\\n?\\x60{3}$/i);
  return (match ? match[1] : trimmed).trim();
}

function parseCvImport(raw: string): CvImportData {
  const cleaned = stripJsonCodeFence(raw);
  let value: unknown;
  try { value = JSON.parse(cleaned); }
  catch { throw new Error("That is not valid JSON. Paste the complete JSON returned from the CV analysis, optionally inside one fenced JSON code block."); }
  const root = asObject(value, "The JSON");
  if (root.schema !== "inlinked.cv-import.v1") throw new Error('The JSON schema must be "inlinked.cv-import.v1". Copy the Inlinked CV prompt and use its exact output format.');
  const candidate = asObject(root.candidate, "candidate");
  const job = asObject(root.jobPreferences, "jobPreferences");
  const lead = asObject(root.leadPreferences, "leadPreferences");
  const result: CvImportData = {
    candidate: {
      professionalSummary: textValue(candidate.professionalSummary, "candidate.professionalSummary"),
      experienceTitles: listValue(candidate.experienceTitles, "candidate.experienceTitles", 50),
      skills: listValue(candidate.skills, "candidate.skills", 100),
      tools: listValue(candidate.tools, "candidate.tools", 100),
      industries: listValue(candidate.industries, "candidate.industries", 50),
      certifications: listValue(candidate.certifications, "candidate.certifications", 50),
      languages: listValue(candidate.languages, "candidate.languages", 30)
    },
    jobPreferences: {
      targetRoles: listValue(job.targetRoles, "jobPreferences.targetRoles", 80),
      keywords: listValue(job.keywords, "jobPreferences.keywords", 100),
      seniorityLevels: listValue(job.seniorityLevels, "jobPreferences.seniorityLevels", 30)
    },
    leadPreferences: {
      industries: listValue(lead.industries, "leadPreferences.industries", 50),
      keywords: listValue(lead.keywords, "leadPreferences.keywords", 100),
      profileSummary: textValue(lead.profileSummary, "leadPreferences.profileSummary")
    },
    notes: listValue(root.notes, "notes", 30)
  };
  const hasImportable = result.jobPreferences.targetRoles.length || result.jobPreferences.keywords.length ||
    result.jobPreferences.seniorityLevels.length || result.leadPreferences.industries.length ||
    result.leadPreferences.keywords.length || result.leadPreferences.profileSummary;
  if (!hasImportable) throw new Error("The JSON contains no Inlinked preference fields to import. Check the CV and try again.");
  return result;
}

function mergeLists(current: unknown, incoming: string[], max: number): string[] {
  const existing = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  return Array.from(new Set([...existing, ...incoming].map(item => item.trim()).filter(Boolean))).slice(0, max);
}

function appendSummary(current: unknown, incoming: string): string {
  const existing = typeof current === "string" ? current.trim() : "";
  const addition = incoming.trim();
  if (!addition || existing.includes(addition)) return existing.slice(0, 4000);
  const separator = existing ? "\n\n" : "";
  const available = Math.max(0, 4000 - existing.length - separator.length);
  return (existing + separator + addition.slice(0, available)).slice(0, 4000);
}

function showList(values: string[]): string {
  return values.length ? values.join(" · ") : "None extracted";
}

export default function CvImportSettings() {
  const [jsonText, setJsonText] = useState("");
  const [parsed, setParsed] = useState<CvImportData | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CV_EXTRACTION_PROMPT);
      setPromptCopied(true);
      setMessage("Prompt copied. Attach your CV PDF to a ChatGPT message, paste the prompt, and ask for the JSON output.");
    } catch {
      setMessage("Clipboard access was blocked. You can select and copy the prompt shown below.");
    }
  }

  function validate() {
    setValidating(true);
    setMessage("");
    try {
      const result = parseCvImport(jsonText);
      setParsed(result);
      setMessage("JSON is valid. Review the extracted information below before importing.");
    } catch (error) {
      setParsed(null);
      setMessage(error instanceof Error ? error.message : "Could not validate the JSON.");
    } finally {
      setValidating(false);
    }
  }

  async function importPreferences() {
    if (!parsed) return;
    setSaving(true);
    setMessage("");
    try {
      const [leadResponse, jobResponse] = await Promise.all([
        fetch("/api/preferences", { cache: "no-store" }),
        fetch("/api/job-preferences", { cache: "no-store" })
      ]);
      if (leadResponse.status === 401 || jobResponse.status === 401) { location.href = "/login"; return; }
      const [leadData, jobData] = await Promise.all([leadResponse.json(), jobResponse.json()]);
      if (!leadResponse.ok) throw new Error(leadData.error || "Could not load lead preferences.");
      if (!jobResponse.ok) throw new Error(jobData.error || "Could not load job preferences.");

      const currentLead = leadData.preferences || {};
      const currentJob = jobData.preferences || {};
      const candidateKeywords = [...parsed.candidate.skills, ...parsed.candidate.tools];
      const jobPayload = {
        ...currentJob,
        targetRoles: mergeLists(currentJob.targetRoles, [...parsed.jobPreferences.targetRoles, ...parsed.candidate.experienceTitles], 80),
        keywords: mergeLists(currentJob.keywords, [...parsed.jobPreferences.keywords, ...candidateKeywords], 100),
        seniorityLevels: mergeLists(currentJob.seniorityLevels, parsed.jobPreferences.seniorityLevels, 30)
      };
      const leadPayload = {
        ...currentLead,
        industries: mergeLists(currentLead.industries, [...parsed.leadPreferences.industries, ...parsed.candidate.industries], 50),
        keywords: mergeLists(currentLead.keywords, [...parsed.leadPreferences.keywords, ...candidateKeywords], 100),
        profileSummary: appendSummary(currentLead.profileSummary, parsed.leadPreferences.profileSummary || parsed.candidate.professionalSummary)
      };

      const [jobSaveResponse, leadSaveResponse] = await Promise.all([
        fetch("/api/job-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jobPayload) }),
        fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leadPayload) })
      ]);
      const [jobSaveData, leadSaveData] = await Promise.all([jobSaveResponse.json(), leadSaveResponse.json()]);
      if (!jobSaveResponse.ok || !leadSaveResponse.ok) {
        const errors = [jobSaveData.error, leadSaveData.error].filter(Boolean);
        throw new Error(errors.length ? errors.join(" ") : "One or more preference sections could not be saved. Please check both preference tabs.");
      }
      setMessage("CV information imported successfully. Existing preferences were kept; extracted roles, skills, tools and industries were added. Review both preference tabs when convenient.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed. Your existing preferences have not been intentionally cleared.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel">
    <div className="section-heading">
      <div>
        <div className="eyebrow">PROFILE IMPORT</div>
        <h2>Import preferences from your CV</h2>
        <p className="muted">The PDF stays in your ChatGPT conversation. Inlinked only receives the structured JSON you paste here.</p>
      </div>
    </div>

    <div className="lead-form">
      <div className="wide">
        <strong>1. Ask ChatGPT to analyse your CV</strong>
        <p className="muted">Attach your CV as a PDF in ChatGPT, copy this prompt, and send them together in one message.</p>
        <pre className="prompt-box">{CV_EXTRACTION_PROMPT}</pre>
        <button type="button" className="secondary" onClick={() => void copyPrompt()}>{promptCopied ? "Copy prompt again" : "Copy CV extraction prompt"}</button>
      </div>

      <label className="wide">
        2. Paste ChatGPT's JSON response
        <textarea rows={12} value={jsonText} onChange={event => { setJsonText(event.target.value); setParsed(null); setMessage(""); }} placeholder={'{\n  "schema": "inlinked.cv-import.v1",\n  "candidate": { ... },\n  "jobPreferences": { ... },\n  "leadPreferences": { ... },\n  "notes": []\n}'} />
        <small className="muted">Paste the complete JSON object from ChatGPT, including its single fenced JSON code block if provided.</small>
      </label>
      <div className="wide row" style={{ justifyContent: "flex-end" }}>
        <button type="button" onClick={validate} disabled={validating || !jsonText.trim()}>{validating ? "Checking..." : "Validate and preview"}</button>
      </div>
    </div>

    {parsed && <section className="panel" style={{ background: "#fbfdfc", marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Review before importing</h3>
      <p><strong>Suggested job roles:</strong> {showList(parsed.jobPreferences.targetRoles.length ? parsed.jobPreferences.targetRoles : parsed.candidate.experienceTitles)}</p>
      <p><strong>Job skills and keywords:</strong> {showList([...new Set([...parsed.jobPreferences.keywords, ...parsed.candidate.skills, ...parsed.candidate.tools])])}</p>
      <p><strong>Seniority levels:</strong> {showList(parsed.jobPreferences.seniorityLevels)}</p>
      <p><strong>Lead industries:</strong> {showList([...new Set([...parsed.leadPreferences.industries, ...parsed.candidate.industries])])}</p>
      <p><strong>Lead keywords:</strong> {showList([...new Set([...parsed.leadPreferences.keywords, ...parsed.candidate.skills, ...parsed.candidate.tools])])}</p>
      <p><strong>CV summary:</strong> {parsed.leadPreferences.profileSummary || parsed.candidate.professionalSummary || "None extracted"}</p>
      <p><strong>Certifications:</strong> {showList(parsed.candidate.certifications)}</p>
      <p><strong>Languages:</strong> {showList(parsed.candidate.languages)}</p>
      {parsed.notes.length > 0 && <div><strong>Notes from extraction</strong><ul>{parsed.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      <div className="status" style={{ marginTop: 14 }}>
        Import adds the extracted values to your existing preferences. It does not change your target countries, locations, work modes, salary, employment types, excluded keywords, or lead decision-maker titles.
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
        <button type="button" onClick={() => void importPreferences()} disabled={saving}>{saving ? "Importing and saving..." : "Import into my preferences"}</button>
      </div>
    </section>}

    <p className="muted" role="status">{message}</p>
  </section>;
}
