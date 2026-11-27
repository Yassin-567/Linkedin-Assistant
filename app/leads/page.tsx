"use client";

import { useEffect, useMemo, useState } from "react";
import LeadChatGptPrompt from "@/components/LeadChatGptPrompt";
import JsonImportPanel, { type JsonImportValidation } from "@/components/JsonImportPanel";

type Preferences = {
  services: string[];
  serviceDescription: string;
  idealCustomerDescription: string;
  problemsSolved: string;
  customerTypes: string[];
  industries: string[];
  decisionMakerRoles: string[];
  countries: string[];
  locations: string[];
  buyingSignals: string[];
  sourceCategories: string[];
  discoveryEngines: string[];
  excludedKeywords: string[];
  projectType: string;
  minimumBudget: string;
  budgetCurrency: string;
  preferredCustomerValue: string;
  language: string;
};

type Profile = { id: string; name: string; description: string; preferences: Preferences; isActive: boolean };
type Scores = { serviceMatch?: number; buyingIntent?: number; freshness?: number; commercialPotential?: number; contactability?: number; priority?: number };
type Lead = {
  id: string; profileId: string | null; title: string; company: string; contactName: string; contactRole: string;
  location: string; country: string; opportunitySummary: string; serviceRequested: string; discoveryEngine: string;
  buyingIntent: string; confidence: string; projectType: string; sourcePlatform: string; researchTool?: string; sourceUrl: string; recommendedOutreach?: string;
  publishedAt: string | null; evidence: string[]; scores: Scores; status: string; notes: string;
  nextFollowUp: string | null; wonValue: number | null; wonCurrency: string;
};
const defaultPreferences: Preferences = {
  services: [], serviceDescription: "", idealCustomerDescription: "", problemsSolved: "", customerTypes: [], industries: [],
  decisionMakerRoles: [], countries: [], locations: [],
  buyingSignals: ["explicit_request", "recommendation", "outsourcing"],
  sourceCategories: ["linkedin_public", "reddit", "facebook_public", "x_public", "forums", "business_sites", "project_sites"],
  discoveryEngines: ["direct_demand", "opportunity_signal", "ideal_customer"],
  excludedKeywords: [], projectType: "either", minimumBudget: "", budgetCurrency: "",
  preferredCustomerValue: "", language: "English"
};
const statusOptions = ["New", "Qualified", "Contacted", "In discussion", "Proposal", "Won", "Lost", "Not relevant"];
const engines = [
  { id: "direct_demand", label: "Direct demand", hint: "People openly asking for a provider or service" },
  { id: "opportunity_signal", label: "Opportunity signals", hint: "Businesses showing problems, growth or outsourcing signals" },
  { id: "ideal_customer", label: "Ideal customers", hint: "Businesses matching your target customer profile" }
];
const sources = [
  { id: "linkedin_public", label: "Public LinkedIn posts" }, { id: "reddit", label: "Reddit" },
  { id: "facebook_public", label: "Public Facebook posts" }, { id: "x_public", label: "Public X/Twitter posts" },
  { id: "forums", label: "Forums and communities" }, { id: "business_sites", label: "Business websites" },
  { id: "project_sites", label: "Project websites" }, { id: "other_public", label: "Other public sources" }
];
const splitLines = (value: string) => value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase());
const JSON_FENCE_INSTRUCTION = "Return exactly one JSON object inside a single fenced code block (```json ... ```), with nothing before or after the block, no splitting across multiple blocks, never as plain text or a file download.";

const isJsonRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function validateCommercialLeadsImport(value: unknown, activeProfileId: string): JsonImportValidation {
  if (!isJsonRecord(value)) return { value, error: "Provide one JSON object with profileId, researchTool and a leads array." };
  if (value.profileId !== activeProfileId) return { value, error: "The JSON profileId must match the currently selected Lead Profile. Copy the prompt again after changing profiles." };
  if (!Array.isArray(value.leads) || value.leads.length < 1 || value.leads.length > 50) return { value, error: "Provide between 1 and 50 commercial leads in the leads array." };
  if (value.researchTool !== undefined && typeof value.researchTool !== "string") return { value, error: "researchTool must be a string." };
  const allowedEngines = ["direct_demand", "opportunity_signal", "ideal_customer"];
  for (let index = 0; index < value.leads.length; index++) {
    const lead = value.leads[index];
    if (!isJsonRecord(lead)) return { value, error: "Lead " + (index + 1) + " must be a JSON object." };
    const title = typeof lead.title === "string" ? lead.title.trim() : "";
    const company = typeof lead.company === "string" ? lead.company.trim() : "";
    const engine = typeof lead.discoveryEngine === "string" ? lead.discoveryEngine : "";
    let validSource = false;
    try { const url = new URL(typeof lead.sourceUrl === "string" ? lead.sourceUrl : ""); validSource = ["http:", "https:"].includes(url.protocol); } catch {}
    if ((!title && !company) || !validSource || !allowedEngines.includes(engine)) {
      return { value, error: "Lead " + (index + 1) + " needs a title or company, a valid public sourceUrl and a recognized discoveryEngine." };
    }
  }
  return { value };
}
function validateLeadProfileImport(value: unknown): JsonImportValidation {
  if (!isJsonRecord(value)) return { value, error: "Provide one profile object with name, description and preferences." };
  if (typeof value.name !== "string" || !value.name.trim()) return { value, error: "A profile name is required." };
  if (!isJsonRecord(value.preferences)) return { value, error: "A preferences object is required." };
  const input = value.preferences;
  const arrayLimits: Record<string, number> = {
    services: 40, customerTypes: 30, industries: 40, decisionMakerRoles: 30, countries: 40,
    locations: 60, buyingSignals: 30, sourceCategories: 20, discoveryEngines: 3, excludedKeywords: 100
  };
  const cleanArray = (key: string): string[] => {
    const fallback = defaultPreferences[key as keyof Preferences];
    const source = Array.isArray(input[key]) ? input[key] as unknown[] : Array.isArray(fallback) ? fallback : [];
    return [...new Set(source.filter((item): item is string => typeof item === "string")
      .map(item => item.trim().slice(0, 120)).filter(Boolean))].slice(0, arrayLimits[key]);
  };
  const allowedSources = ["linkedin_public", "reddit", "facebook_public", "x_public", "forums", "business_sites", "project_sites", "other_public"];
  const allowedEngines = ["direct_demand", "opportunity_signal", "ideal_customer"];
  const projectType = ["one_time", "recurring", "either"].includes(String(input.projectType)) ? String(input.projectType) : "either";
  const cleanText = (key: string, max: number, fallback = "") => typeof input[key] === "string" ? (input[key] as string).trim().slice(0, max) : fallback;
  const preferences = {
    services: cleanArray("services"),
    serviceDescription: cleanText("serviceDescription", 3000),
    idealCustomerDescription: cleanText("idealCustomerDescription", 3000),
    problemsSolved: cleanText("problemsSolved", 2000),
    customerTypes: cleanArray("customerTypes"),
    industries: cleanArray("industries"),
    decisionMakerRoles: cleanArray("decisionMakerRoles"),
    countries: cleanArray("countries"),
    locations: cleanArray("locations"),
    buyingSignals: cleanArray("buyingSignals"),
    sourceCategories: cleanArray("sourceCategories").filter(item => allowedSources.includes(item)),
    discoveryEngines: cleanArray("discoveryEngines").filter(item => allowedEngines.includes(item)),
    excludedKeywords: cleanArray("excludedKeywords"),
    projectType,
    minimumBudget: cleanText("minimumBudget", 40),
    budgetCurrency: cleanText("budgetCurrency", 12),
    preferredCustomerValue: cleanText("preferredCustomerValue", 40),
    language: cleanText("language", 60, "English") || "English"
  };
  return { value: { name: value.name.trim().slice(0, 100), description: typeof value.description === "string" ? value.description.trim().slice(0, 500) : "", preferences } };
}
const profileImportPrompt = [
  "Convert only the business and customer information I explicitly provide in this conversation or paste alongside this prompt into one Inlinked Lead Profile JSON object.",
  "Do not browse the web, research companies, infer facts, invent services or fill gaps with assumptions. Use empty strings and arrays when I have not provided the information.",
  "Return the top-level keys name, description and preferences. preferences must use exactly these form keys: services, serviceDescription, idealCustomerDescription, problemsSolved, customerTypes, industries, decisionMakerRoles, countries, locations, buyingSignals, sourceCategories, discoveryEngines, excludedKeywords, projectType, minimumBudget, budgetCurrency, preferredCustomerValue, language.",
  "Limits: name 100 characters; description 500; serviceDescription and idealCustomerDescription 3000 each; problemsSolved 2000; minimumBudget and preferredCustomerValue 40 each; budgetCurrency 12; language 60. Each array has unique strings up to 120 characters: services 40, customerTypes 30, industries 40, decisionMakerRoles 30, countries 40, locations 60, buyingSignals 30, sourceCategories 20, discoveryEngines 3, excludedKeywords 100.",
  "Allowed projectType values: one_time, recurring, either. Allowed discoveryEngines: direct_demand, opportunity_signal, ideal_customer. Allowed sourceCategories: linkedin_public, reddit, facebook_public, x_public, forums, business_sites, project_sites, other_public.",
  'Example: {"name":"My profile","description":"Short description","preferences":{"services":[],"serviceDescription":"","idealCustomerDescription":"","problemsSolved":"","customerTypes":[],"industries":[],"decisionMakerRoles":[],"countries":[],"locations":[],"buyingSignals":[],"sourceCategories":[],"discoveryEngines":[],"excludedKeywords":[],"projectType":"either","minimumBudget":"","budgetCurrency":"","preferredCustomerValue":"","language":"English"}}',
  JSON_FENCE_INSTRUCTION
].join("\n");
function buildCommercialLeadImportPrompt(profileId: string): string {
  return [
    "Prepare up to 50 verified commercial lead records for my currently active Inlinked Lead Profile.",
    "Use the same record fields accepted by /api/assistant-leads-save. Do not invent contact details, budgets, source evidence or buying intent. Each lead must include a real public http(s) sourceUrl and discoveryEngine set to direct_demand, opportunity_signal or ideal_customer.",
    "The required top-level profileId is exactly " + profileId + ". Include researchTool as the AI application name or Unknown.",
    'Each leads item may contain title, company, contactName, contactRole, website, profileUrl, email, phone, location, country, opportunitySummary, serviceRequested, discoveryEngine, buyingIntent, confidence, projectType, budgetText, estimatedValueMin, estimatedValueMax, valueCurrency, sourcePlatform, sourceType, sourceUrl, publishedAt, evidenceUrls, scores, sourceMetadata and recommendedOutreach.',
    'Example shape: {"profileId":"' + profileId + '","researchTool":"ChatGPT","leads":[{"title":"Bookkeeping support opportunity","company":"Example Ltd","sourceUrl":"https://example.com/request","discoveryEngine":"direct_demand","recommendedOutreach":"A concise, evidence-based first message."}]}',
    "Return between 1 and 50 lead objects. Leave unknown optional values blank or null. scores may use serviceMatch, buyingIntent, freshness, commercialPotential, contactability and priority, each from 0 to 100.",
    JSON_FENCE_INSTRUCTION
  ].join("\n");
}

export default function LeadsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [profileName, setProfileName] = useState("My first business profile");
  const [profileDescription, setProfileDescription] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [engineSelection, setEngineSelection] = useState<string[]>(defaultPreferences.discoveryEngines);
  const [locationOverride, setLocationOverride] = useState("");
  const [queryOverride, setQueryOverride] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState("All");
  const [expandedLead, setExpandedLead] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/lead-profiles", { cache: "no-store" });
        if (response.status === 401) { window.location.href = "/login"; return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load lead profiles.");
        if (cancelled) return;
        const rows: Profile[] = Array.isArray(data.profiles) ? data.profiles : [];
        setProfiles(rows);
        if (rows.length) {
          const active = rows.find(x => x.isActive) || rows[0];
          setSelectedId(active.id); setProfileName(active.name); setProfileDescription(active.description || "");
          setPreferences({ ...defaultPreferences, ...active.preferences });
          setEngineSelection(active.preferences.discoveryEngines?.length ? active.preferences.discoveryEngines : defaultPreferences.discoveryEngines);
          setEditing(false);
        } else {
          setEditing(true);
        }
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Could not load lead profiles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function loadLeads(profileId = selectedId) {
    setLoadingLeads(true);
    try {
      const query = profileId ? "?profileId=" + encodeURIComponent(profileId) : "";
      const response = await fetch("/api/leads" + query, { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/login"; return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load leads.");
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Could not load saved leads.");
    } finally { setLoadingLeads(false); }
  }

  useEffect(() => { if (selectedId) void loadLeads(selectedId); else setLeads([]); }, [selectedId]);

  async function chooseProfile(id: string) {
    let profile = profiles.find(x => x.id === id);
    if (!profile) return;
    if (!profile.isActive) {
      try {
        const response = await fetch("/api/lead-profiles", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: profile.id, name: profile.name, description: profile.description, preferences: profile.preferences, isActive: true })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not activate this profile.");
        profile = data.profile as Profile;
        setProfiles(old => old.map(item => item.id === profile!.id ? profile! : { ...item, isActive: false }));
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Could not activate this profile.");
        return;
      }
    }
    setSelectedId(id);
    setProfileName(profile.name); setProfileDescription(profile.description || "");
    setPreferences({ ...defaultPreferences, ...profile.preferences });
    setEngineSelection(profile.preferences.discoveryEngines?.length ? profile.preferences.discoveryEngines : defaultPreferences.discoveryEngines);
    setEditing(false); setSearchMessage(""); setProfileMessage("");
  }

  function newProfile() {
    setSelectedId(""); setProfileName(""); setProfileDescription("");
    setPreferences(defaultPreferences);
    setEngineSelection([...defaultPreferences.discoveryEngines]);
    setEditing(true); setLeads([]); setProfileMessage("Create a profile for one business, service or customer segment.");
  }

  function updateList(key: keyof Preferences, value: string) {
    setPreferences(old => {
      const next = { ...old };
      if (key === "serviceDescription" || key === "idealCustomerDescription" || key === "problemsSolved") {
        (next as any)[key] = value;
      } else {
        (next as any)[key] = splitLines(value);
      }
      return next;
    });
  }

  function togglePreference(key: "discoveryEngines" | "sourceCategories", value: string) {
    setPreferences(old => {
      const values = old[key];
      return { ...old, [key]: values.includes(value) ? values.filter(x => x !== value) : [...values, value] };
    });
    if (key === "discoveryEngines") {
      setEngineSelection(old => old.includes(value) ? old.filter(x => x !== value) : [...old, value]);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!profileName.trim()) { setProfileMessage("Give this profile a name."); return; }
    setSavingProfile(true); setProfileMessage("");
    try {
      const payload = { name: profileName.trim(), description: profileDescription, preferences, isActive: true };
      const response = await fetch("/api/lead-profiles", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedId ? { ...payload, id: selectedId } : payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save profile.");
      const saved: Profile = data.profile;
      setProfiles(old => {
        const next = old.some(x => x.id === saved.id) ? old.map(x => x.id === saved.id ? saved : { ...x, isActive: false }) : [...old.map(x => ({ ...x, isActive: false })), saved];
        return next.sort((a, b) => Number(b.isActive) - Number(a.isActive));
      });
      setSelectedId(saved.id); setPreferences({ ...defaultPreferences, ...saved.preferences });
      setEngineSelection(saved.preferences.discoveryEngines?.length ? saved.preferences.discoveryEngines : defaultPreferences.discoveryEngines);
      setEditing(false); setProfileMessage("Profile saved. Your preferences will be included in future ChatGPT research prompts.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Could not save profile.");
    } finally { setSavingProfile(false); }
  }

  async function deleteProfile() {
    if (!selectedId || !window.confirm("Delete this profile? Saved leads will be kept without a profile assignment.")) return;
    try {
      const response = await fetch("/api/lead-profiles?id=" + encodeURIComponent(selectedId), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete profile.");
      const remaining = profiles.filter(x => x.id !== selectedId);
      setProfiles(remaining);
      if (remaining.length) chooseProfile(remaining[0].id); else newProfile();
      setProfileMessage("Profile deleted. Existing leads were preserved.");
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not delete profile."); }
  }

  async function updateLead(lead: Lead, changes: Partial<Lead>) {
    try {
      const response = await fetch("/api/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, status: changes.status ?? lead.status, notes: changes.notes ?? lead.notes,
          nextFollowUp: changes.nextFollowUp ?? lead.nextFollowUp, recommendedOutreach: changes.recommendedOutreach ?? lead.recommendedOutreach ?? "", wonValue: changes.wonValue ?? lead.wonValue,
          wonCurrency: changes.wonCurrency ?? lead.wonCurrency })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update lead.");
      setLeads(old => old.map(x => x.id === lead.id ? data.lead : x));
    } catch (error) { setSearchMessage(error instanceof Error ? error.message : "Could not update lead."); }
  }

  async function copyRecommended(text:string) { try { await navigator.clipboard.writeText(text); setSearchMessage("Recommended message copied."); } catch { setSearchMessage("Could not copy the message. Select and copy it manually."); } }

  async function removeLead(lead: Lead) {
    if (!window.confirm("Remove this lead from your pipeline?")) return;
    try {
      const response = await fetch("/api/leads?id=" + encodeURIComponent(lead.id), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove lead.");
      setLeads(old => old.filter(x => x.id !== lead.id));
    } catch (error) { setSearchMessage(error instanceof Error ? error.message : "Could not remove lead."); }
  }

  const shownLeads = useMemo(() => leads.filter(lead => {
    const text = [lead.title, lead.company, lead.contactName, lead.opportunitySummary, lead.serviceRequested, lead.location, lead.country].join(" ").toLowerCase();
    return (pipelineStatus === "All" || lead.status === pipelineStatus) && text.includes(pipelineSearch.toLowerCase());
  }), [leads, pipelineStatus, pipelineSearch]);

  const textareaField = (key: keyof Preferences, heading: string, hint: string) => {
    const value = preferences[key];
    return <label className="wide" key={key}>{heading}
      <textarea rows={2} value={Array.isArray(value) ? value.join("\n") : String(value || "")}
        onChange={event => updateList(key, event.target.value)} placeholder={hint} />
      <small className="muted">{hint}</small>
    </label>;
  };

  function importProfileJson(value: unknown): string {
    const input = value as { name: string; description: string; preferences: Preferences };
    setProfileName(input.name);
    setProfileDescription(input.description);
    setPreferences(input.preferences);
    setEngineSelection(input.preferences.discoveryEngines?.length ? input.preferences.discoveryEngines : []);
    setEditing(true);
    setProfileMessage("Profile JSON loaded into the form. Review the details and save the profile to apply them.");
    return "Profile details loaded into the form. Review them and click Create profile or Save profile.";
  }

  async function importCommercialLeads(value: unknown): Promise<string> {
    if (!selectedId) throw new Error("Create or select a saved Lead Profile before importing commercial leads.");
    const input = value as { profileId: string; researchTool?: string; leads: Record<string, unknown>[] };
    const batch = input.leads.map(lead => ({ ...lead, profileId: selectedId, researchTool: lead.researchTool ?? input.researchTool }));
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: batch, researchTool: input.researchTool })
    });
    const data = await response.json();
    const limitSkipped = Array.isArray(data.results) ? data.results.filter((item: { status?: string }) => item.status === "limit_reached").length : 0;
    await loadLeads(selectedId);
    if (response.status === 402 || data.code === "COMMERCIAL_LEAD_LIMIT_REACHED") {
      throw new Error((data.error || "The Free plan does not include commercial leads.") + " " + limitSkipped + " lead(s) skipped due to the plan limit.");
    }
    if (!response.ok) throw new Error(data.error || "Could not import commercial leads.");
    return "Import complete: " + data.saved + " saved, " + data.duplicates + " duplicates, " + data.invalid + " invalid.";
  }

  return <main className="workspace leads-workspace">
    <header className="topbar">
      <div><div className="eyebrow">CUSTOMER ACQUISITION WORKSPACE</div><h1>Leads</h1><p className="muted">Find demand, identify potential customers and turn commercial opportunities into revenue. This workspace is independent from LinkedIn Connections.</p></div>
      <div className="row"><a className="button secondary" href="/prospects">LinkedIn Connections</a><button type="button" className="secondary" onClick={() => void loadLeads(selectedId)}>Refresh pipeline</button></div>
    </header>

    <section className="stats leads-stats">
      <div className="stat"><span>Saved opportunities</span><strong>{leads.length}</strong></div>
      <div className="stat"><span>Qualified</span><strong>{leads.filter(x => x.status === "Qualified").length}</strong></div>
      <div className="stat"><span>In discussion</span><strong>{leads.filter(x => x.status === "In discussion" || x.status === "Proposal").length}</strong></div>
      <div className="stat"><span>Won customers</span><strong>{leads.filter(x => x.status === "Won").length}</strong></div>
    </section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">YOUR OFFERINGS AND TARGET CUSTOMERS</div><h2>Lead profiles</h2><p className="muted">Create separate profiles for each business, service, market or customer segment.</p></div><button type="button" onClick={newProfile}>+ New profile</button></div>
      {loading ? <div className="empty">Loading your lead profiles…</div> : <>
        <div className="lead-profile-toolbar">
          <label>Active profile<select value={selectedId} onChange={event => chooseProfile(event.target.value)}><option value="">New profile</option>{profiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name}{profile.isActive ? " · Active" : ""}</option>)}</select></label>
          {selectedId && <span className="profile-count">{profiles.length} saved profile{profiles.length === 1 ? "" : "s"}</span>}
          <button type="button" className="secondary" onClick={() => setEditing(old => !old)}>{editing ? "Hide preferences" : "Edit preferences"}</button>
        </div>
        {editing && <form className="lead-form leads-profile-form" onSubmit={saveProfile}>
          <div className="form-section-title wide"><strong>Business and offering</strong><small>Tell Inlinked what you sell and what problems it solves.</small></div>
          <label>Profile name<input required value={profileName} onChange={event => setProfileName(event.target.value)} placeholder="e.g. UK Bookkeeping Services"/></label>
          <label>Short profile description<input value={profileDescription} onChange={event => setProfileDescription(event.target.value)} placeholder="e.g. Remote bookkeeping for small UK service businesses"/></label>
          {textareaField("services", "Services and products", "Monthly bookkeeping, website redesign, maintenance contracts…")}
          {textareaField("serviceDescription", "What do you offer?", "Describe your services, strengths and the value customers receive.")}
          {textareaField("problemsSolved", "Problems you solve", "Manual invoicing, poor scheduling, outdated websites, admin backlog…")}
          <div className="form-section-title wide"><strong>Ideal customer profile</strong><small>Describe who is most likely to buy.</small></div>
          {textareaField("idealCustomerDescription", "Describe your ideal customer", "Describe the type of organisation or person most likely to buy, including size, needs and circumstances.")}
          {textareaField("customerTypes", "Customer types", "Small businesses, property managers, restaurants…")}
          {textareaField("industries", "Target industries", "Appliance repair, hospitality, property maintenance…")}
          {textareaField("decisionMakerRoles", "Decision-maker roles", "Owner, Founder, Operations Manager, Finance Director…")}
          {textareaField("countries", "Target countries", "United Kingdom, United States…")}
          {textareaField("locations", "Cities and regions", "London, Manchester, Birmingham…")}
          <div className="form-section-title wide"><strong>Commercial preferences</strong><small>Use these as filters and ranking signals, not assumptions about a lead's budget.</small></div>
          <label>Preferred project type<select value={preferences.projectType} onChange={event => setPreferences(old => ({ ...old, projectType: event.target.value }))}><option value="either">One-time or recurring</option><option value="one_time">One-time projects</option><option value="recurring">Recurring / ongoing services</option></select></label>
          <label>Minimum published budget<input value={preferences.minimumBudget} onChange={event => setPreferences(old => ({ ...old, minimumBudget: event.target.value }))} placeholder="Optional, e.g. 500"/></label>
          <label>Budget currency<input value={preferences.budgetCurrency} onChange={event => setPreferences(old => ({ ...old, budgetCurrency: event.target.value.toUpperCase().slice(0,12) }))} placeholder="e.g. GBP, USD, EUR"/></label>
          <label>Preferred customer value<input value={preferences.preferredCustomerValue} onChange={event => setPreferences(old => ({ ...old, preferredCustomerValue: event.target.value }))} placeholder="Optional target or range"/></label>
          <label>Search language<input value={preferences.language} onChange={event => setPreferences(old => ({ ...old, language: event.target.value }))} placeholder="English"/></label>
          <div className="form-section-title wide"><strong>Discovery configuration</strong><small>Choose the types of opportunities and public sources to search.</small></div>
          {textareaField("buyingSignals", "Buying signals", "explicit_request, recommendation, outsourcing, provider_replacement, project_planning…")}
          <div className="wide"><strong className="small-heading">Discovery engines</strong><div className="option-grid">{engines.map(engine => <label className="option-card" key={engine.id}><input type="checkbox" checked={preferences.discoveryEngines.includes(engine.id)} onChange={() => togglePreference("discoveryEngines", engine.id)}/><span><strong>{engine.label}</strong><small>{engine.hint}</small></span></label>)}</div></div>
          <div className="wide"><strong className="small-heading">Public source categories</strong><div className="option-grid">{sources.map(source => <label className="option-card" key={source.id}><input type="checkbox" checked={preferences.sourceCategories.includes(source.id)} onChange={() => togglePreference("sourceCategories", source.id)}/><span><strong>{source.label}</strong></span></label>)}</div></div>
          {textareaField("excludedKeywords", "Excluded keywords", "Competitors, irrelevant sectors, free work, internships…")}
          <div className="wide form-footer"><span className="muted">Profiles are private to your account. Searches use these preferences until you change them.</span><div className="row"><button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : selectedId ? "Save profile" : "Create profile"}</button>{selectedId && <button type="button" className="delete" onClick={() => void deleteProfile()}>Delete profile</button>}</div></div>
        </form>}
        {editing && <JsonImportPanel
          title="Import profile from JSON"
          description="Copy the prompt, paste the profile JSON, then validate and preview it. Import loads the values into this form; review and save them to create or update the profile."
          prompt={profileImportPrompt}
          placeholder='{"name":"My profile","description":"","preferences":{"services":[],"serviceDescription":"","idealCustomerDescription":"","problemsSolved":""}}'
          validate={validateLeadProfileImport}
          onImport={importProfileJson}
          importLabel="Load profile into form"
        />}
        {profileMessage && <p className="status" role="status">{profileMessage}</p>}
      </>}
    </section>

    <section className="panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">CHATGPT-POWERED PUBLIC RESEARCH</div>
          <h2>Find potential customers</h2>
          <p className="muted">Copy the commercial-lead prompt link instead of copying the prompt text. The gateway uses the active Lead Profile and its saved discovery preferences.</p>
        </div>
      </div>
      <div className="lead-form">
        <div className="wide">
          <strong className="small-heading">Discovery engines for this research</strong>
          <div className="option-grid">{engines.map(engine => <label className="option-card" key={engine.id}>
            <input type="checkbox" checked={engineSelection.includes(engine.id)}
              onChange={() => setEngineSelection(old => old.includes(engine.id) ? old.filter(x => x !== engine.id) : [...old, engine.id])}/>
            <span><strong>{engine.label}</strong><small>{engine.hint}</small></span>
          </label>)}</div>
          <small className="muted">Choose which discovery approaches to use for this run. This does not overwrite the saved profile.</small>
        </div>
        <label>Location override
          <input value={locationOverride} onChange={event => setLocationOverride(event.target.value)} placeholder="Leave blank to use saved target locations"/>
        </label>
        <label>Extra search context
          <input value={queryOverride} onChange={event => setQueryOverride(event.target.value)} placeholder="e.g. owner-managed firms, urgent projects, small teams"/>
        </label>
        <LeadChatGptPrompt
          profileId={selectedId}
          profileName={profiles.find(x => x.id === selectedId)?.name || profileName}
          profileSaved={Boolean(selectedId) && !editing}
          engines={engineSelection}
          locationOverride={locationOverride}
          queryOverride={queryOverride}
        />
      </div>
      <p className="footnote">ChatGPT researches public sources, distinguishes direct requests from inferred opportunities and ideal-customer matches, then saves qualified leads with personalized outreach drafts. It does not access private profiles or messages, and it must not invent buying intent, contacts or budgets.</p>
    </section>

    <JsonImportPanel
      title="Import from ChatGPT"
      description={selectedId ? "Import up to 50 commercial leads into the active Lead Profile. The saved-lead API enforces duplicates and plan limits." : "Create and save a Lead Profile first to enable commercial-lead import."}
      prompt={selectedId ? buildCommercialLeadImportPrompt(selectedId) : "Create and save a Lead Profile to generate its import prompt."}
      placeholder='{"profileId":"ACTIVE_PROFILE_ID","researchTool":"ChatGPT","leads":[{"title":"Example opportunity","company":"Example Ltd","sourceUrl":"https://example.com/request","discoveryEngine":"direct_demand"}]}'
      validate={value => validateCommercialLeadsImport(value, selectedId)}
      onImport={importCommercialLeads}
      importLabel="Import commercial leads"
    />
    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">COMMERCIAL PIPELINE</div><h2>Saved opportunities</h2><p className="muted">Track prospects from discovery through qualification, conversations, proposals and revenue.</p></div><button type="button" className="secondary" onClick={() => void loadLeads(selectedId)}>Refresh</button></div>
      <div className="toolbar"><input type="search" value={pipelineSearch} onChange={event => setPipelineSearch(event.target.value)} placeholder="Search company, service, location or evidence…"/><select value={pipelineStatus} onChange={event => setPipelineStatus(event.target.value)}><option>All</option>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></div>
      {loadingLeads ? <div className="empty">Loading saved opportunities…</div> : shownLeads.length ? <div className="job-list">
        {shownLeads.map(lead => <article className="job-card" key={lead.id}>
          <div className="job-card-top"><div className="job-title-block"><h3>{lead.title || lead.company || "Potential customer"}</h3><strong>{lead.company || lead.contactName || "Business not identified"}</strong><div className="job-meta">{[lead.location, lead.country, label(lead.discoveryEngine), lead.sourcePlatform].filter(Boolean).join(" · ")}</div></div>
            <div className="job-status-outreach"><select aria-label={"Pipeline status for " + (lead.company || lead.title)} value={lead.status} onChange={event => void updateLead(lead, { status: event.target.value })}>{statusOptions.map(status => <option key={status}>{status}</option>)}</select><aside className="recommended-outreach"><label>Recommended outreach<textarea rows={4} defaultValue={lead.recommendedOutreach || ""} onBlur={event=>{const value=event.target.value;if(value!==(lead.recommendedOutreach||""))void updateLead(lead,{recommendedOutreach:value});}} placeholder="A personalized business outreach message will appear here."/></label><button type="button" className="secondary" disabled={!lead.recommendedOutreach?.trim()} onClick={()=>void copyRecommended(lead.recommendedOutreach||"")}>Copy message</button></aside></div>
          </div>
          <div className="job-chip-row"><span className="job-chip">AI research tool: {lead.researchTool || "Unknown"}</span><span className="job-chip">{lead.buyingIntent}</span><span className="job-chip">{lead.confidence} confidence</span>{typeof lead.scores?.priority === "number" && <span className="job-chip">{lead.scores.priority}/100 priority</span>}</div>
          {lead.opportunitySummary && <p className="job-match">{lead.opportunitySummary}</p>}
          <div className="job-actions"><a href={lead.sourceUrl} target="_blank" rel="noreferrer">Original source ↗</a><button type="button" className="text-button" onClick={() => setExpandedLead(old => old === lead.id ? "" : lead.id)}>{expandedLead === lead.id ? "Hide details" : "Notes and follow-up"}</button><button type="button" className="text-button delete" onClick={() => void removeLead(lead)}>Remove</button></div>
          {expandedLead === lead.id && <div className="job-expanded">
            <label>Notes<textarea rows={3} defaultValue={lead.notes || ""} onBlur={event => void updateLead(lead, { notes: event.target.value })} placeholder="Add qualification notes, decision maker context or next step…"/></label>
            <label>Next follow-up<input type="date" defaultValue={lead.nextFollowUp ? String(lead.nextFollowUp).slice(0,10) : ""} onBlur={event => void updateLead(lead, { nextFollowUp: event.target.value || null })}/></label>
            {lead.status === "Won" && <label>Confirmed revenue<input type="number" min="0" step="0.01" defaultValue={lead.wonValue ?? ""} onBlur={event => void updateLead(lead, { wonValue: event.target.value === "" ? null : Number(event.target.value) })} placeholder="Enter actual revenue"/></label>}
            {lead.sourceUrl && <p><strong>Source:</strong> <a href={lead.sourceUrl} target="_blank" rel="noreferrer">{lead.sourceUrl}</a></p>}
            {lead.evidence?.length > 0 && <p><strong>Evidence links:</strong> {lead.evidence.length}</p>}
          </div>}
        </article>)}
      </div> : <div className="empty"><strong>{leads.length ? "No leads match these filters" : "Your opportunity pipeline is ready"}</strong><p>{leads.length ? "Try another search term or pipeline status." : "Create a Lead Profile, generate a ChatGPT research prompt and let ChatGPT save verified opportunities here."}</p></div>}
    </section>
    <footer>Inlinked Leads · Find demand, qualify opportunities and grow revenue.</footer>
  </main>;
}
