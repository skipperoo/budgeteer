import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "@/lib/api";
import { Database, Search } from "lucide-react";

interface TableInfo {
  name: string;
  columns: { name: string; type: string; is_primary_key: boolean }[];
  row_count: number;
}

export default function DashboardPage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<TableInfo[]>(`${API_BASE}/admin/tables`)
      .then(setTables)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Database Tables</h1>

      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tables..."
          className="w-full h-9 pl-9 rounded-md border border-input bg-background text-sm"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((table) => (
            <button
              key={table.name}
              onClick={() => navigate(`/tables/${table.name}`)}
              className="bg-card border border-border/50 rounded-xl p-4 text-left hover:border-border transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 mb-2">
                <Database className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="font-semibold text-sm truncate">{table.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{table.columns.length} columns</span>
                <span>{table.row_count.toLocaleString()} rows</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {table.columns.slice(0, 5).map((col) => (
                  <span
                    key={col.name}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      col.is_primary_key
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {col.name}
                    <span className="opacity-60 ml-0.5">({col.type})</span>
                  </span>
                ))}
                {table.columns.length > 5 && (
                  <span className="text-[10px] text-muted-foreground italic">
                    +{table.columns.length - 5} more
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
