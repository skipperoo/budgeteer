import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccountStore } from "@/stores/account-store";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { accounts, fetchAccounts } = useAccountStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccounts().finally(() => setLoading(false));
  }, [fetchAccounts]);

  // Account distribution for pie chart
  const typeData = [
    { name: "Personal", value: accounts.filter((a) => a.type === "personal").length },
    { name: "Joint", value: accounts.filter((a) => a.type === "joint").length },
    { name: "Savings", value: accounts.filter((a) => a.type === "savings").length },
  ].filter((d) => d.value > 0);

  // Currency distribution
  const currencyMap = new Map<string, number>();
  accounts.forEach((a) => currencyMap.set(a.currency, (currencyMap.get(a.currency) ?? 0) + 1));
  const currencyData = Array.from(currencyMap.entries()).map(([name, value]) => ({ name, value }));

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Personal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {accounts.filter((a) => a.type === "personal").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Joint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {accounts.filter((a) => a.type === "joint").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {accounts.filter((a) => a.type === "savings").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account types pie chart */}
        <Card>
          <CardHeader>
            <CardTitle>Account Types</CardTitle>
          </CardHeader>
          <CardContent>
            {typeData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No accounts yet. <Button variant="link" className="p-0" onClick={() => navigate("/accounts")}>Create one</Button>
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {typeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Currency distribution bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>Currencies</CardTitle>
          </CardHeader>
          <CardContent>
            {currencyData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No data to display.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={currencyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                    {currencyData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                No accounts yet. Create one to get started.
              </p>
              <Button onClick={() => navigate("/accounts")}>Create Account</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.slice(0, 5).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/accounts/${account.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{account.currency}</span>
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full capitalize">
                      {account.type}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(account.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
