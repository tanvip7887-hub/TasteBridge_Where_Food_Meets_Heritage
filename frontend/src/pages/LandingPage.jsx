import { useState } from "react";
import AuthModal from "../components/auth/AuthModal.jsx";
import tasteBridgeVideo from "../assets/tastebridge_video.mp4";
import {
  Utensils,
  BookOpen,
  ChefHat,
  Compass,
  Award,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const LandingPage = () => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("register");

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <div className="w-full">
      {/* Full-Bleed Cinematic Hero Section (Full Viewport Height) */}
      <section className="relative w-full min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden py-16 px-4 sm:px-6 lg:px-8">
        {/* Background Video (Edge-to-Edge Full Screen Width & Height) */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src={tasteBridgeVideo} type="video/mp4" />
        </video>

        {/* Subtle Dark Gradient Overlay for Maximum Legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/60 to-black/75 backdrop-brightness-95 z-10" />

        {/* Hero Content Layer */}
        <div className="relative z-20 max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-600/90 border border-red-400/50 text-white text-xs font-semibold uppercase tracking-wider shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Culture-First Food Marketplace
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-tight drop-shadow-md">
            Where Food Meets <span className="bg-gradient-to-r from-red-400 via-amber-300 to-orange-400 bg-clip-text text-transparent">Heritage</span>
          </h1>

          <p className="text-base sm:text-xl text-gray-100 leading-relaxed font-normal drop-shadow-sm max-w-2xl mx-auto">
            TasteBridge connects passionate home cooks with food lovers seeking authentic regional recipes, ancient culinary traditions, and immersive food storytelling.
          </p>

          {/* Single Button on Video */}
          <div className="pt-6 flex items-center justify-center">
            <button
              onClick={() => openAuth("register")}
              className="w-full sm:w-auto px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-base"
            >
              Join as a Member <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Main Container for Below-the-Fold Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Core Pillars */}
        <section className="space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              A Cultural Culinary Journey
            </h2>
            <p className="text-sm text-gray-600">
              Discover what makes TasteBridge a heritage marketplace, not just another food app.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white rounded-2xl border border-orange-100 shadow-xs hover:shadow-md transition-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
                <ChefHat className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Verified Local Cooks</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Meet authentic home chefs cooking ancestral recipes passed down through generations.
              </p>
            </div>

            <div className="p-6 bg-white rounded-2xl border border-orange-100 shadow-xs hover:shadow-md transition-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Cultural Stories</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Every dish comes with its origin story, ingredients heritage, and cultural significance.
              </p>
            </div>

            <div className="p-6 bg-white rounded-2xl border border-orange-100 shadow-xs hover:shadow-md transition-shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Culinary Experiences</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Book dining sessions, heritage workshops, and interactive cooking masterclasses.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">The TasteBridge Eco-System</h3>
              <p className="text-xs text-gray-500 mt-1">Connecting food lovers, home cooks, and delivery partners.</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-4 h-4" /> Fully Verified Platform
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100">
              <Utensils className="w-5 h-5 text-red-600 mb-2" />
              <h4 className="font-semibold text-sm text-gray-900">Heritage Dishes</h4>
              <p className="text-xs text-gray-600 mt-1">Traditional recipes crafted with authentic regional spices.</p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100">
              <Award className="w-5 h-5 text-amber-600 mb-2" />
              <h4 className="font-semibold text-sm text-gray-900">Taste Card & Passport</h4>
              <p className="text-xs text-gray-600 mt-1">Unlock stamps as you discover regional cuisines across India.</p>
            </div>

            <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100">
              <ChefHat className="w-5 h-5 text-rose-600 mb-2" />
              <h4 className="font-semibold text-sm text-gray-900">Cook Onboarding</h4>
              <p className="text-xs text-gray-600 mt-1">Empowering home chefs to share their passion and earn.</p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
              <Compass className="w-5 h-5 text-emerald-600 mb-2" />
              <h4 className="font-semibold text-sm text-gray-900">Cultural Discovery</h4>
              <p className="text-xs text-gray-600 mt-1">Filter by region, festival, ancestral dietary style, and story.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
      />
    </div>
  );
};

export default LandingPage;
