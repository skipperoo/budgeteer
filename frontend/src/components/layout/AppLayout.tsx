import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
