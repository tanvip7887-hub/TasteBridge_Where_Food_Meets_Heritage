import cookImage from "../../assets/cook_homepage.png";
import {
  Sparkles,
  ChefHat,
  ArrowRight,
  UtensilsCrossed,
  Clock,
  Coins,
  Truck,
  ShieldCheck,
} from "lucide-react";

export const BecomeCookLandingPage = ({ onStartApplication }) => {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-gray-800">
      {/* =========================================================================
          1. IMMERSIVE HERO SECTION
          Matches the reference layout: Full-bleed hero with cook_homepage image,
          cinematic overlay, red pill badge, bold typography & prominent CTA.
          ========================================================================= */}
      <section className="relative isolate flex min-h-[calc(100svh-4.5rem)] w-full items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
        {/* Existing cook_homepage asset prominently displayed */}
        <img
          src={cookImage}
          alt="Authentic home cooking and heritage kitchen"
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />

        {/* Cinematic gradient overlay matching reference visual style */}
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />

        <div className="relative z-20 mx-auto w-full max-w-4xl space-y-6 text-center sm:space-y-8">
          {/* Top Pill Badge matching reference design */}
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-100/40 bg-red-600/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span>Become a TasteBridge Cook</span>
          </div>

          {/* Required Headline */}
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md sm:text-6xl md:text-7xl">
            Your Kitchen. Your Stories. Your Legacy.
          </h1>

          {/* Required Description */}
          <p className="mx-auto max-w-2xl text-base font-normal leading-relaxed text-gray-100 drop-shadow-sm sm:text-xl">
            Share the recipes your family loves, preserve your food traditions, and earn by cooking from home.
          </p>

          {/* Prominent Sign Up as a Cook CTA */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={onStartApplication}
              className="w-full sm:w-auto px-9 py-4 bg-gradient-to-r from-red-600 via-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-red-600/35 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <ChefHat className="w-5 h-5" />
              <span>Sign Up as a Cook</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Clean Highlights Strip (Text-based, no chunky cards) */}
          <div className="pt-6 grid grid-cols-3 gap-4 max-w-xl mx-auto border-t border-white/20 text-white/90">
            <div>
              <span className="block text-xl sm:text-2xl font-black text-amber-300">100%</span>
              <span className="text-[11px] sm:text-xs text-gray-200 font-medium">Home Kitchens</span>
            </div>
            <div className="border-x border-white/20">
              <span className="block text-xl sm:text-2xl font-black text-amber-300">Flexible</span>
              <span className="text-[11px] sm:text-xs text-gray-200 font-medium">Your Schedule & Capacity</span>
            </div>
            <div>
              <span className="block text-xl sm:text-2xl font-black text-amber-300">Doorstep</span>
              <span className="text-[11px] sm:text-xs text-gray-200 font-medium">Pickups & Delivery</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. PHILOSOPHY & KITCHEN FREEDOM (Editorial layout, not a card grid)
          ========================================================================= */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="text-center space-y-4 max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-red-600">
            A Platform for Home Kitchens, Not Restaurants
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Cook What You Love. From Your Own Home.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
            TasteBridge is dedicated to the homemakers, grandmothers, and culinary heritage keepers across India. You don't need a commercial license, expensive equipment, or a restaurant dining room — just your domestic kitchen and the food you make with love.
          </p>
        </div>

        {/* Clean Editorial Feature List (Inline rows, no boxed cards) */}
        <div className="divide-y divide-orange-100 border-y border-orange-100 text-left">
          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Preserve Generational Family Recipes</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Share authentic regional flavors passed down through your family with customers craving true home cooking.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-red-700 uppercase tracking-wider shrink-0 sm:text-right">
              Authentic & Pure
            </span>
          </div>

          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Cook Entirely On Your Schedule</h3>
                <p className="text-sm text-gray-600 mt-1">
                  You choose which days you cook, preferred meal slots (lunch, dinner, or snacks), and advance notice times.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider shrink-0 sm:text-right">
              Zero Pressure
            </span>
          </div>

          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Respect & Transparent Earnings</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Earn steady income cooking from home. Receive transparent weekly deposits directly to your bank account.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider shrink-0 sm:text-right">
              Direct Payouts
            </span>
          </div>

          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Doorstep Pickup & Delivery Handled</h3>
                <p className="text-sm text-gray-600 mt-1">
                  No delivery hassle. TasteBridge logistics agents pick up freshly packed food right at your door and deliver it warm.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider shrink-0 sm:text-right">
              Logistics Covered
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. HOW ONBOARDING WORKS (Linear Timeline Flow, not cards)
          ========================================================================= */}
      <section className="py-20 sm:py-24 bg-white border-y border-orange-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-red-600">
              Simple 4-Step Process
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              From Application to Your First Home Order
            </h2>
          </div>

          {/* Sequential Process Flow */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-left relative">
            <div className="space-y-3">
              <div className="text-3xl font-black text-red-600/30">01</div>
              <h3 className="text-base font-bold text-gray-900">Tell Us About Your Kitchen</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Complete the simple 5-step application with your regional cuisine, specialty dishes, and cooking availability.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-3xl font-black text-amber-500/40">02</div>
              <h3 className="text-base font-bold text-gray-900">Upload Identity Proof</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Provide basic government ID verification. If you have an FSSAI registration number, submit it; if not, we guide you.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-3xl font-black text-emerald-600/40">03</div>
              <h3 className="text-base font-bold text-gray-900">Quick Curation Review</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Our team reviews your kitchen details to maintain food quality standards and activates your cook profile.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-3xl font-black text-purple-600/40">04</div>
              <h3 className="text-base font-bold text-gray-900">Start Cooking & Earning</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Accept pre-orders from food lovers in your neighborhood. We handle doorstep pickups and weekly payouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. FOOD SAFETY & HYGIENE COMMITMENT (Editorial guidance banner)
          ========================================================================= */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-left">
        <div className="border-l-4 border-amber-500 pl-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span>Food Safety & FSSAI Support</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
            We Guide You Every Step of the Way
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            All cooks on TasteBridge operate in accordance with food safety standards. If you don't already have an FSSAI FoSCoS registration, you can still begin your application today — our onboarding team provides simple guidance to help you obtain your basic 14-digit registration online easily.
          </p>
        </div>
      </section>

      {/* =========================================================================
          5. AUTHENTIC VOICE (Pull-quote format, not cards)
          ========================================================================= */}
      <section className="py-16 sm:py-20 bg-white border-t border-orange-100 text-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <span className="text-4xl text-amber-500 font-serif leading-none block">“</span>
          <p className="text-lg sm:text-2xl text-gray-800 font-medium italic leading-relaxed">
            Cooking had always been my passion for my family. On TasteBridge, neighbors now look forward to my authentic Kathiyawadi dishes every weekend. It has brought me my own financial independence and deep respect in my community.
          </p>
          <div>
            <span className="block font-bold text-sm text-gray-900">Urmila Ben</span>
            <span className="block text-xs text-gray-500">Gujarati Heritage Home Cook • Ahmedabad</span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. FINAL CALL TO ACTION (Full-width cinematic banner)
          ========================================================================= */}
      <section className="py-20 bg-gradient-to-r from-red-600 via-amber-600 to-red-700 text-white text-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Your Kitchen is Ready. <br />Your City is Waiting.
          </h2>
          <p className="text-base sm:text-lg text-white/90 max-w-xl mx-auto leading-relaxed">
            It takes just a few minutes to submit your kitchen details and join our growing family of home cooks.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onStartApplication}
              className="px-9 py-4 bg-white text-red-700 hover:bg-orange-50 rounded-2xl font-extrabold text-base shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-3"
            >
              <ChefHat className="w-5 h-5 text-red-600" />
              <span>Sign Up as a Cook</span>
              <ArrowRight className="w-5 h-5 text-red-600" />
            </button>
          </div>
        </div>
      </section>

      {/* Minimal Brand Footer */}
      <footer className="py-8 bg-[#FAF8F5] border-t border-orange-100 text-center text-xs text-gray-500">
        <p className="font-semibold text-gray-700">TasteBridge — Where Food Meets Heritage</p>
        <p className="mt-1">Empowering home cooks, homemakers, and grandmothers across India.</p>
      </footer>
    </div>
  );
};

export default BecomeCookLandingPage;
