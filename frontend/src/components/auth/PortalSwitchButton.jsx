import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { switchPortal } from "../../store/slices/authSlice.js";

export const PortalSwitchButton = ({ portal, to, onClick, className = "", children, disabled = false }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const handleSwitch = async () => {
    setError("");
    setSwitching(true);
    try {
      await dispatch(switchPortal(portal)).unwrap();
      onClick?.();
      navigate(to);
    } catch (failure) {
      setError(failure?.message || `Could not switch to the ${portal.toLowerCase()} portal.`);
    } finally {
      setSwitching(false);
    }
  };

  return <span className="inline-flex flex-col items-start">
    <button type="button" onClick={handleSwitch} disabled={disabled || switching} aria-busy={switching} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {switching ? "Switching…" : children}
    </button>
    {error && <span role="alert" className="mt-1 max-w-64 text-xs font-medium text-red-700">{error}</span>}
  </span>;
};

export default PortalSwitchButton;
