import { Outlet } from "react-router-dom";
import Navbar from "../components/layout/Navbar.jsx";
import { Heart } from "lucide-react";
import FavoritesSessionSync from "../components/favorites/FavoritesSessionSync.jsx";

export const MainLayout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] overflow-x-hidden">
      <FavoritesSessionSync />
      <Navbar />

      <main className="flex-1 w-full">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-orange-100 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-500 space-y-2">
          <p className="flex items-center justify-center gap-1 font-medium text-gray-700">
            TasteBridge — Crafting cultural food journeys with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
          </p>
          <p>© 2026 TasteBridge Marketplace. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
