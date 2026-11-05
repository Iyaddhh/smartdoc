"use client";
import { useState, type FormEvent } from "react";
import type { AgendaCategory } from "@/lib/api/workspace-types";

const colors = [
  ["#2563eb", "Biru"], ["#16a34a", "Hijau"], ["#ea580c", "Oranye"],
  ["#7c3aed", "Ungu"], ["#db2777", "Merah muda"], ["#64748b", "Abu-abu"],
];

export function CategoryBadge({ category }: { category?: AgendaCategory }) {
  return <span className="agenda-category-badge"><i aria-hidden="true" style={{ backgroundColor: category?.color || "#64748b" }} />{category?.name || "Tanpa kategori"}</span>;
}

export default function AgendaCategories({ categories, busy, onSave, onDelete }: {
  categories: AgendaCategory[];
  busy: boolean;
  onSave: (body: Pick<AgendaCategory, "name" | "color">, id?: string) => Promise<boolean>;
  onDelete: (category: AgendaCategory) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<AgendaCategory | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0][0]);
  function reset() { setEditing(null); setName(""); setColor(colors[0][0]); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSave({ name: name.trim(), color }, editing?.id)) reset();
  }
  return <details className="workspace-card agenda-categories">
    <summary>Kelola kategori <span className="count-badge">{categories.length}</span></summary>
    <p className="field-hint">Kategori hanya terlihat di workspace Anda. Menghapus kategori tidak menghapus agendanya.</p>
    <div className="category-manager-layout">
      <form className="category-form" onSubmit={save} aria-label={editing ? "Edit kategori" : "Tambah kategori"}>
        <fieldset className="planner-fields" disabled={busy}>
          <label>Nama kategori<input name="category_name" placeholder="Contoh: Pekerjaan" maxLength={50} required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <fieldset className="category-color-field"><legend>Warna kategori</legend><div className="category-colors">{colors.map(([value, label]) => <label key={value} title={label}>
            <input type="radio" name="category_color" value={value} checked={color === value} onChange={() => setColor(value)} aria-label={label} /><i style={{ backgroundColor: value }} aria-hidden="true" />
          </label>)}</div></fieldset>
          <div className="workspace-toolbar"><button type="submit" disabled={!name.trim()}>{editing ? "Simpan kategori" : "Tambah kategori"}</button>{editing && <button type="button" onClick={reset}>Batal</button>}</div>
        </fieldset>
      </form>
      <div className="category-list">{categories.map((category) => <div className="category-row" data-category-id={category.id} key={category.id}>
        <CategoryBadge category={category} /><div className="workspace-actions"><button type="button" disabled={busy} aria-label={`Edit kategori ${category.name}`} onClick={() => { setEditing(category); setName(category.name); setColor(category.color); }}>Edit</button>
          <button type="button" disabled={busy} aria-label={`Hapus kategori ${category.name}`} onClick={async () => {
            if (!window.confirm(`Hapus kategori “${category.name}”? Agendanya tetap tersedia tanpa kategori.`)) return;
            if (await onDelete(category) && editing?.id === category.id) reset();
          }}>Hapus</button></div>
      </div>)}{!categories.length && <p className="field-hint">Belum ada kategori. Tambahkan kategori pertama Anda.</p>}</div>
    </div>
  </details>;
}
