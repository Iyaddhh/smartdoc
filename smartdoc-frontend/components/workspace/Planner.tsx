"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { listPlannerItems, listWorkspaceDocuments, savePlannerItem, completePlannerItem, deletePlannerItem, listAgendaCategories, saveAgendaCategory, deleteAgendaCategory } from "@/lib/api/workspace";
import { useAuth } from "@/lib/AuthContext";
import type { AgendaCategory, WorkspaceDocument, PlannerItem, PlannerInput } from "@/lib/api/workspace-types";
import { plannerLocalTime, schedulePlannerItem } from "@/lib/planner-scheduling";
import PageHeading from "@/components/ui/PageHeading";
import EmptyState from "@/components/EmptyState";
import { isCompletedResponse, mutationFailure } from "@/lib/success-feedback";
import AgendaCategories, { CategoryBadge } from "@/components/workspace/AgendaCategories";
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";

const statusLabels = { todo: "Belum mulai", doing: "Dikerjakan", done: "Selesai" };
const priorityLabels = { normal: "Normal", high: "Tinggi", low: "Rendah" };
const dragType = "application/x-smartdoc-planner";

export default function Planner() {
  const { user } = useAuth();
  const zone = user?.timezone || "Asia/Jakarta";
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [docs, setDocs] = useState<WorkspaceDocument[]>([]);
  const [categories, setCategories] = useState<AgendaCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<PlannerItem | null>(null);
  const [kind, setKind] = useState<PlannerItem["kind"]>("task");
  const [formVersion, setFormVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chosenDate, setDate] = useState("");
  const selectedDate = chosenDate || plannerLocalTime(new Date().toISOString(), zone).slice(0, 10);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [filter, setFilter] = useState<"all" | "unscheduled" | "selected">("all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const mutation = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [a, b, c] = await Promise.all([listPlannerItems(), listWorkspaceDocuments(), listAgendaCategories()]);
      if (!active) return;
      if (a.success && b.success && c.success && a.data && b.data && c.data) { setItems(a.data); setDocs(b.data.items); setCategories(c.data); }
      else setError(a.error || b.error || c.error || "Gagal memuat agenda.");
      setLoading(false);
    };
    void load(); return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading || !window.location.hash.startsWith("#agenda-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [loading, items]);

  const dateKey = (item: PlannerItem) => plannerLocalTime(item.kind === "event" ? item.starts_at : item.due_at, zone).slice(0, 10);
  const [year, month, day] = selectedDate.split("-").map(Number);
  const selected = new Date(year, month - 1, day);
  const first = view === "month" ? new Date(year, month - 1, 1) : view === "week" ? new Date(year, month - 1, day - ((selected.getDay() + 6) % 7)) : selected;
  const cells = view === "month" ? new Date(year, month, 0).getDate() : view === "week" ? 7 : 1;
  const startOffset = view === "month" ? (first.getDay() + 6) % 7 : 0;
  const categorized = items.filter((item) => categoryFilter === "all" || (categoryFilter === "none" ? !item.category_id : item.category_id === categoryFilter));
  const visible = categorized.filter((item) => filter === "all" || (filter === "unscheduled" ? !dateKey(item) : dateKey(item) === selectedDate));
  const isFiltered = filter !== "all" || categoryFilter !== "all";
  const prettyDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date + "T12:00:00"));

  function beginMutation() {
    if (mutation.current || loading) return false;
    mutation.current = true; setBusy(true); setError(""); setNotice(""); return true;
  }
  function endMutation() { mutation.current = false; setBusy(false); }
  async function refreshItems() {
    const response = await listPlannerItems();
    if (response.success && response.data) setItems(response.data);
    else setError(response.message || "Gagal memperbarui agenda. Muat ulang halaman.");
  }
  function resetEditor() { setEditing(null); setKind("task"); setCategoryId(""); setFormVersion((v) => v + 1); }
  function edit(item: PlannerItem) {
    setEditing(item); setKind(item.kind); setCategoryId(item.category_id || ""); setFormVersion((v) => v + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const starts = String(form.get("starts_at") || "");
    const ends = String(form.get("ends_at") || "");
    if (kind === "event" && ends <= starts) { setError("Waktu selesai harus sesudah waktu mulai."); return; }
    if (!beginMutation()) return;
    try {
      const payload: PlannerInput = {
        kind, title: String(form.get("title") || ""), description: String(form.get("description") || ""),
        status: form.get("status") as PlannerInput["status"], priority: form.get("priority") as PlannerInput["priority"],
        starts_at: kind === "event" ? starts : null, ends_at: kind === "event" ? ends : null,
        due_at: kind === "task" ? String(form.get("due_at") || "") || null : null,
        document_ids: form.getAll("document_ids").map(String),
        category_id: categoryId || null,
      };
      const response = await savePlannerItem(payload, editing?.id);
      if (!isCompletedResponse(response)) setError(mutationFailure(response));
      else { resetEditor(); setFilter("all"); setCategoryFilter("all"); await refreshItems(); setNotice("Agenda disimpan. Seret kartu ke kalender untuk mengatur tanggalnya."); }
    } finally { endMutation(); }
  }
  async function schedule(item: PlannerItem, date: string) {
    if (!beginMutation()) return;
    try {
      const response = await savePlannerItem(schedulePlannerItem(item, date, zone), item.id);
      if (!isCompletedResponse(response)) setError(mutationFailure(response));
      else {
        await refreshItems(); setDate(date);
        if (editing?.id === item.id) resetEditor();
        setNotice(`${item.title} dijadwalkan pada ${prettyDate(date)}.`);
      }
    } finally { endMutation(); }
  }
  function dragStart(event: DragEvent<HTMLElement>, item: PlannerItem) {
    if (busy || loading) { event.preventDefault(); return; }
    event.dataTransfer.setData(dragType, item.id); event.dataTransfer.effectAllowed = "move"; setDragging(item.id);
  }
  function dragEnd() { setDragging(null); setDropDate(null); }
  function drop(event: DragEvent<HTMLButtonElement>, date: string) {
    event.preventDefault();
    const item = items.find((entry) => entry.id === event.dataTransfer.getData(dragType));
    dragEnd();
    if (item) void schedule(item, date);
  }
  function navigate(direction: number) {
    const next = view === "month" ? new Date(year, month - 1 + direction, 1) : new Date(year, month - 1, day + direction * (view === "week" ? 7 : 1));
    setDate(next.toLocaleDateString("sv-SE"));
  }

  async function saveCategory(body: Pick<AgendaCategory, "name" | "color">, id?: string) {
    if (!beginMutation()) return false;
    try {
      const response = await saveAgendaCategory(body, id);
      if (!isCompletedResponse(response) || !response.data) { setError(mutationFailure(response)); return false; }
      const saved = response.data;
      setCategories((current) => [...current.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "id")));
      setNotice(id ? "Kategori diperbarui." : "Kategori ditambahkan.");
      return true;
    } finally { endMutation(); }
  }
  async function deleteCategory(category: AgendaCategory) {
    if (!beginMutation()) return false;
    try {
      const response = await deleteAgendaCategory(category.id);
      if (!isCompletedResponse(response)) { setError(mutationFailure(response)); return false; }
      setCategories((current) => current.filter((entry) => entry.id !== category.id));
      setItems((current) => current.map((item) => item.category_id === category.id ? { ...item, category_id: null } : item));
      if (categoryId === category.id) setCategoryId("");
      if (categoryFilter === category.id) setCategoryFilter("all");
      setNotice("Kategori dihapus. Agendanya tetap tersedia tanpa kategori.");
      return true;
    } finally { endMutation(); }
  }

  return <section className="workspace-page">
    <PageHeading title="Kalender" description={`Kelola tugas dan kegiatan, lalu seret kartu ke tanggal tujuan. Zona waktu ${zone}.`} />
    <div className="workspace-toolbar calendar-toolbar">
      <div className="calendar-navigation"><button type="button" aria-label="Periode sebelumnya" onClick={() => navigate(-1)}><ChevronLeft size={16} /></button><button type="button" onClick={() => setDate(plannerLocalTime(new Date().toISOString(), zone).slice(0, 10))}>Hari ini</button><button type="button" aria-label="Periode berikutnya" onClick={() => navigate(1)}><ChevronRight size={16} /></button></div>
      <input aria-label="Tanggal kalender" type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
      <select aria-label="Tampilan kalender" value={view} onChange={(event) => setView(event.target.value as typeof view)}><option value="month">Bulan</option><option value="week">Minggu</option><option value="day">Hari</option></select>
    </div>
    {error && <p role="alert" className="guest-error">{error}</p>}
    <p role="status" className="planner-notice">{loading ? "Memuat agenda…" : busy ? "Menyimpan perubahan…" : notice}</p>
    <div className="calendar-category-toolbar"><label>Filter kategori<select aria-label="Filter kategori" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Semua kategori</option><option value="none">Tanpa kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
    <AgendaCategories categories={categories} busy={busy || loading} onSave={saveCategory} onDelete={deleteCategory} />
    <div className={`calendar-surface ${dragging ? "is-dragging" : ""}`} aria-busy={busy || loading}>
      <h2 className="calendar-period">{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(selected)}</h2>
      {view !== "day" && <div className="calendar-weekdays" aria-hidden="true">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((label) => <span key={label}>{label}</span>)}</div>}
      <div className={`calendar-grid ${view === "day" ? "calendar-single" : ""}`}>
        {Array.from({ length: startOffset }, (_, index) => <div key={`empty-${index}`} />)}
        {Array.from({ length: cells }, (_, index) => {
          const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index).toLocaleDateString("sv-SE");
          const entries = categorized.filter((item) => dateKey(item) === date);
          return <button type="button" data-date={date} className={`${selectedDate === date ? "selected" : ""} ${dropDate === date ? "drop-target" : ""}`} key={date} onClick={() => setDate(date)} aria-pressed={selectedDate === date} aria-label={`${prettyDate(date)}, ${entries.length} agenda`}
            onDragOver={(event) => { if (!busy && event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropDate(date); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDate(null); }} onDrop={(event) => drop(event, date)}>
            <strong>{date.slice(8)}</strong>{entries.slice(0, 3).map((item) => <span draggable={!busy} onDragStart={(event) => { event.stopPropagation(); dragStart(event, item); }} onDragEnd={dragEnd} className={item.status === "done" ? "completed" : ""} key={item.id} title={item.title}><i className="calendar-category-dot" aria-hidden="true" style={{ backgroundColor: categories.find((category) => category.id === item.category_id)?.color || "#64748b" }} />{item.kind === "task" ? "Tugas: " : ""}{item.title}</span>)}{entries.length > 3 && <small>+{entries.length - 3} lainnya</small>}
          </button>;
        })}
      </div>
    </div>

    <div className="planner-layout calendar-workbench">
      <form ref={formRef} key={`${editing?.id || "new"}-${formVersion}`} className="workspace-form workspace-form--panel" onSubmit={save}>
        <div className="section-heading"><h2>{editing ? "Edit agenda" : "Buat agenda"}</h2><p>Tambahkan tugas tanpa tanggal atau kegiatan dengan waktu tertentu.</p></div>
        <fieldset disabled={busy || loading} className="planner-fields">
          <label>Jenis<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as PlannerItem["kind"])}><option value="task">Tugas</option><option value="event">Kegiatan</option></select></label>
          <label>Kategori (opsional)<select name="category_id" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Tanpa kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Judul<input name="title" placeholder="Apa yang ingin Anda kerjakan?" required maxLength={200} defaultValue={editing?.title} /></label>
          <label>Catatan<textarea name="description" placeholder="Tambahkan detail (opsional)" maxLength={5000} defaultValue={editing?.description} /></label>
          {kind === "event" ? <div className="form-row form-row--dates"><label>Mulai<input type="datetime-local" name="starts_at" required defaultValue={editing?.starts_at ? plannerLocalTime(editing.starts_at, zone) : selectedDate + "T09:00"} /></label><label>Selesai<input type="datetime-local" name="ends_at" required defaultValue={editing?.ends_at ? plannerLocalTime(editing.ends_at, zone) : selectedDate + "T10:00"} /></label></div> : <label>Deadline (opsional)<input type="datetime-local" name="due_at" defaultValue={editing ? plannerLocalTime(editing.due_at, zone) : ""} /><span className="field-hint">Kosongkan untuk menjadwalkannya nanti melalui kalender.</span></label>}
          <div className="form-row"><label>Status<select name="status" defaultValue={editing?.status || "todo"}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Prioritas<select name="priority" defaultValue={editing?.priority || "normal"}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          {docs.length > 0 || editing?.document_ids.length ? <label>Dokumen terkait (opsional, maksimal 20)<select name="document_ids" multiple defaultValue={editing?.document_ids || []}>{docs.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}{editing?.document_ids.filter((id) => !docs.some((doc) => doc.id === id)).map((id) => <option key={id} value={id}>Dokumen tertaut ({id.slice(0, 8)})</option>)}</select></label> : <p className="field-hint">Anda tetap bisa menyimpan agenda tanpa dokumen terkait.</p>}
          <div className="workspace-toolbar"><button className="ui-button ui-button--primary" type="submit">{busy ? "Menyimpan…" : "Simpan agenda"}</button>{editing && <button type="button" onClick={resetEditor}>Batal edit</button>}</div>
        </fieldset>
      </form>

      <section className="planner-agenda" aria-labelledby="agenda-title">
        <div className="section-heading"><h2 id="agenda-title">Daftar agenda <span className="count-badge">{visible.length}</span></h2><p>Seret kartu ke kalender, atau pilih tanggal lalu tekan Jadwalkan.</p></div>
        <label className="planner-filter">Tampilkan<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Semua agenda</option><option value="unscheduled">Belum dijadwalkan</option><option value="selected">Tanggal terpilih: {prettyDate(selectedDate)}</option></select></label>
        <p className="field-hint">Tanggal tujuan: <strong>{prettyDate(selectedDate)}</strong></p>
        <div className="planner-list" aria-busy={loading}>{visible.map((item) => <article key={item.id} id={`agenda-${item.id}`} tabIndex={-1} data-item-id={item.id} draggable={!busy && !loading} onDragStart={(event) => dragStart(event, item)} onDragEnd={dragEnd} className={`workspace-card planner-item ${dragging === item.id ? "dragging" : ""}`}>
          <div className="planner-item-heading"><GripVertical size={18} aria-hidden="true" /><h3>{item.title}</h3><span className="count-badge">{item.kind === "task" ? "Tugas" : "Kegiatan"}</span></div>
          <CategoryBadge category={categories.find((category) => category.id === item.category_id)} />
          {item.description && <p>{item.description}</p>}
          <p className="item-meta"><span data-status={item.status} className={`badge ${item.status === "done" ? "badge-done" : "badge-neutral"}`}>{statusLabels[item.status]}</span><span>Prioritas {priorityLabels[item.priority].toLowerCase()}</span></p>
          <p className="planner-item-date">{dateKey(item) ? `${prettyDate(dateKey(item))}, ${plannerLocalTime(item.kind === "task" ? item.due_at : item.starts_at, zone).slice(11)}${item.kind === "event" && item.ends_at ? ` – ${prettyDate(plannerLocalTime(item.ends_at, zone).slice(0, 10))}, ${plannerLocalTime(item.ends_at, zone).slice(11)}` : ""}` : "Belum dijadwalkan"}</p>
          {item.document_ids.map((id) => <p key={id}><Link href={`/dokumen/${id}`}>Dokumen: {docs.find((doc) => doc.id === id)?.name || "Buka detail dokumen"}</Link></p>)}
          <div className="workspace-actions"><button type="button" disabled={busy || loading} onClick={() => void schedule(item, selectedDate)}>Jadwalkan</button><button type="button" disabled={busy || loading} onClick={() => edit(item)}>Edit</button>
            {item.kind === "task" && item.status !== "done" && <button type="button" disabled={busy || loading} onClick={async () => {
              if (!beginMutation()) return;
              try { const response = await completePlannerItem(item); if (!isCompletedResponse(response)) setError(mutationFailure(response)); else { if (editing?.id === item.id) resetEditor(); await refreshItems(); setNotice("Tugas diselesaikan."); } } finally { endMutation(); }
            }}>Selesai</button>}
            <button type="button" disabled={busy || loading} onClick={async () => {
              if (!window.confirm("Hapus agenda ini?") || !beginMutation()) return;
              try { const response = await deletePlannerItem(item.id); if (!isCompletedResponse(response)) setError(mutationFailure(response)); else { if (editing?.id === item.id) resetEditor(); await refreshItems(); setNotice("Agenda dihapus."); } } finally { endMutation(); }
            }}>Hapus</button></div>
        </article>)}{!loading && !visible.length && <EmptyState icon={<CalendarDays size={24} />} title={isFiltered ? "Tidak ada agenda pada pilihan ini" : "Belum ada agenda"} description={isFiltered ? "Pilih filter lain atau tambahkan agenda baru." : "Isi form untuk menambahkan tugas atau kegiatan pertama Anda."} />}</div>
      </section>
    </div>
  </section>;
}
