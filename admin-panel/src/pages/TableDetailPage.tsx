import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "@/lib/api";
import { ArrowLeft, Search, Trash2, X, Code } from "lucide-react";

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_primary_key: boolean;
  default_value?: string | null;
}

interface TableData {
  columns: ColumnInfo[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  page_size: number;
}

export default function TableDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchCol, setSearchCol] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [jsonEditor, setJsonEditor] = useState<{ row: number; col: string; val: any } | null>(null);

  const fetchData = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    try {
      let url = `${API_BASE}/tables/${name}?page=${page}&page_size=50`;
      if (search && searchCol) url += `&search=${encodeURIComponent(search)}&search_col=${searchCol}`;
      const resp = await apiFetch<TableData>(url);
      setData(resp);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [name, page, search, searchCol]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveCell = async () => {
    if (!editingCell || !data || !name) return;
    const row = data.rows?.[editingCell.row];
    const id = row.id;
    try {
      await apiFetch(`${API_BASE}/tables/${name}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ [editingCell.col]: editValue }),
      });
      setEditingCell(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (!name || selectedIds.size === 0) return;
    try {
      await apiFetch(`${API_BASE}/tables/${name}/rows`, {
        method: "DELETE",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      setConfirmDelete(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!name) return null;

  return (
    <div>
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tables
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{name}</h1>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search..."
            className="w-full h-9 pl-9 rounded-md border border-input bg-background text-sm"
          />
        </div>
        {data && (
          <select
            value={searchCol}
            onChange={(e) => setSearchCol(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All columns</option>
            {data.columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : data && data.columns?.length > 0 && data.rows ? (
        <>
          <div className="overflow-x-auto border border-border/50 rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="py-2 px-2 text-left w-8">
                    <input
                      type="checkbox"
                      disabled={!data.rows?.some((r: any) => r.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(data.rows?.map((r: any) => r.id).filter(Boolean)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      checked={selectedIds.size > 0 && selectedIds.size === data.rows?.filter((r: any) => r.id).length}
                    />
                  </th>
                  {data.columns.map((col) => (
                    <th key={col.name} className="py-2 px-2 text-left font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {col.name}
                      <span className="text-[9px] ml-1 opacity-60">({col.type})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows?.map((row: any, i: number) => (
                  <tr key={row.id || i} className="border-t border-border/20 hover:bg-secondary/30">
                    <td className="py-1.5 px-2">
                      {row.id && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                        />
                      )}
                    </td>
                    {data.columns.map((col) => (
                      <td
                        key={col.name}
                        className={`py-1.5 px-2 font-mono max-w-[250px] truncate ${
                          editingCell?.row === i && editingCell?.col === col.name
                            ? "bg-primary/10"
                            : col.is_primary_key
                            ? "font-semibold"
                            : ""
                        }`}
                        onDoubleClick={() => {
                          const val = row[col.name];
                          if (val !== null && typeof val === "object") {
                            setEditValue(JSON.stringify(val, null, 2));
                            setJsonEditor({ row: i, col: col.name, val });
                          } else {
                            setEditingCell({ row: i, col: col.name });
                            setEditValue(String(val ?? ""));
                          }
                        }}
                      >
                        {editingCell?.row === i && editingCell?.col === col.name ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="flex-1 h-7 px-1 rounded border border-input bg-background text-xs"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveCell();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                            />
                            <button onClick={handleSaveCell} className="text-[10px] px-1 text-primary hover:underline">save</button>
                            <button onClick={() => setEditingCell(null)} className="text-[10px] px-1 text-muted-foreground hover:underline">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          formatCellValue(row[col.name])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>{data.total.toLocaleString()} total rows</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-2 py-1 rounded border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.page_size))}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * data.page_size >= data.total}
                className="px-2 py-1 rounded border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground italic">Table not found or empty.</p>
      )}

      {/* JSON editor modal */}
      {jsonEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setJsonEditor(null)}>
          <div className="mx-4 w-full max-w-2xl bg-card p-6 rounded-lg elevated" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">
                Editing <span className="font-mono text-primary">{jsonEditor.col}</span>
                {' '}(row {jsonEditor.row})
              </h3>
              <button onClick={() => setJsonEditor(null)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full min-h-[200px] font-mono text-xs rounded-md border border-input bg-background p-3"
              spellCheck={false}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setJsonEditor(null)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-input hover:bg-secondary cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!jsonEditor || !name) return;
                  try {
                    // Validate JSON
                    JSON.parse(editValue);
                    await apiFetch(`${API_BASE}/tables/${name}/${data?.rows?.[jsonEditor.row]?.id}`, {
                      method: "PUT",
                      body: JSON.stringify({ [jsonEditor.col]: editValue }),
                    });
                    setJsonEditor(null);
                    fetchData();
                  } catch (err: any) {
                    alert(err.message || "Invalid JSON");
                  }
                }}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(false)}>
          <div className="mx-4 w-full max-w-sm bg-card p-6 rounded-lg elevated" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2">Delete {selectedIds.size} row{selectedIds.size > 1 ? "s" : ""}?</h3>
            <p className="text-xs text-muted-foreground mb-4">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-input hover:bg-secondary cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCellValue(val: any): string {
  if (val === null || val === undefined) return <span className="text-muted-foreground italic">NULL</span> as any;
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") {
    try {
      const preview = JSON.stringify(val);
      return <span className="flex items-center gap-1 text-primary underline underline-offset-2 decoration-dotted decoration-primary/40"><Code className="h-3 w-3 shrink-0" />{preview.length > 60 ? preview.slice(0, 57) + "..." : preview}</span> as any;
    } catch { return String(val); }
  }
  return String(val);
}
