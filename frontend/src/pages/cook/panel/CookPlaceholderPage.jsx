import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft, Mail } from "lucide-react";

export const CookPlaceholderPage = ({
  title,
  description,
  icon: Icon = Sparkles,
  actionText = "Back to dashboard",
  actionLink = "/cook",
  actionHref,
  badge = "Not available yet",
}) => {
  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#D2552B]/10 text-[#D2552B] text-[11px] font-bold mb-2">
          <span>{badge}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#2B1B12] tracking-tight">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-[#2B1B12]/70 mt-1 max-w-2xl leading-relaxed">
          {description}
        </p>
      </div>

      {/* Status and next step */}
      <div className="bg-white rounded-3xl border border-[#2B1B12]/10 p-8 sm:p-14 text-center space-y-5 shadow-xs">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#D2552B]/15 to-[#F4A52A]/20 text-[#D2552B] flex items-center justify-center mx-auto shadow-inner">
          <Icon className="w-8 h-8" />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <p className="text-xs sm:text-sm text-[#2B1B12]/60 leading-relaxed font-normal">
            This section is not available yet.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          {actionHref ? (
            <a
              href={actionHref}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold shadow-md shadow-[#D2552B]/20 transition-all hover:scale-[1.02] cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              <span>{actionText}</span>
            </a>
          ) : (
            <Link
              to={actionLink}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold shadow-md shadow-[#D2552B]/20 transition-all hover:scale-[1.02] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{actionText}</span>
            </Link>
          )}

        </div>
      </div>
    </div>
  );
};

export default CookPlaceholderPage;
