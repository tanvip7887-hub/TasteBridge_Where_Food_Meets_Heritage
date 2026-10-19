import { useState, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { setLocation } from "../../store/locationSlice.js";
import { X, MapPin, Crosshair, Loader2, Home } from "lucide-react";
import axios from "axios";

export const LocationDrawer = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");

  const searchTimeoutRef = useRef(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Search input change with 500ms debounce
  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setGeoError("");

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim() || val.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await axios.get("https://nominatim.openstreetmap.org/search", {
          params: {
            q: val,
            format: "json",
            countrycodes: "in",
            addressdetails: 1,
            limit: 5,
          },
        });

        if (response.data && Array.isArray(response.data)) {
          setResults(response.data);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("Nominatim search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  const handleSelectSearchResult = (item) => {
    const address = item.address || {};
    const shortName =
      address.suburb ||
      address.neighbourhood ||
      address.residential ||
      address.city_district ||
      address.city ||
      address.town ||
      item.display_name.split(",")[0];

    dispatch(
      setLocation({
        shortName,
        fullName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      })
    );

    setQuery("");
    setResults([]);
    onClose();
  };

  const handleGetCurrentLocation = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Couldn't get your location. Search for your area instead.");
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await axios.get("https://nominatim.openstreetmap.org/reverse", {
            params: {
              lat: latitude,
              lon: longitude,
              format: "json",
            },
          });

          if (response.data && response.data.display_name) {
            const address = response.data.address || {};
            const shortName =
              address.suburb ||
              address.neighbourhood ||
              address.residential ||
              address.city ||
              "Current Location";

            dispatch(
              setLocation({
                shortName,
                fullName: response.data.display_name,
                lat: latitude,
                lon: longitude,
              })
            );
            onClose();
          } else {
            setGeoError("Couldn't get your location. Search for your area instead.");
          }
        } catch (err) {
          console.error("Reverse geocode error:", err);
          setGeoError("Couldn't get your location. Search for your area instead.");
        } finally {
          setGeoLoading(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setGeoError("Couldn't get your location. Search for your area instead.");
        setGeoLoading(false);
      },
      { timeout: 10000 }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Dark Transparent Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <aside
        className="relative z-10 w-full max-w-[420px] h-full bg-white shadow-2xl flex flex-col p-6 sm:p-8 space-y-6 overflow-y-auto animate-in slide-in-from-left duration-250"
        role="dialog"
        aria-modal="true"
        aria-label="Location selector"
      >
        {/* Close Button */}
        <div className="flex items-center justify-start">
          <button
            onClick={onClose}
            aria-label="Close location selector"
            className="p-2 text-gray-700 hover:text-black hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search for area, street name.."
            className="w-full px-4 py-3.5 border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-600 transition-colors font-sans"
          />
          {loading && (
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-red-600">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
        </div>

        {/* Nominatim Search Results */}
        {results.length > 0 && (
          <div className="space-y-2 border border-gray-200 p-2 bg-white">
            <p className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider">
              Search Results
            </p>
            {results.map((item, idx) => (
              <button
                key={item.place_id || idx}
                onClick={() => handleSelectSearchResult(item)}
                className="w-full text-left p-2.5 hover:bg-orange-50 transition-colors flex items-start gap-2.5 cursor-pointer group"
              >
                <MapPin className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-900 group-hover:text-red-600 transition-colors">
                    {item.display_name.split(",")[0]}
                  </p>
                  <p className="text-[11px] text-gray-500 line-clamp-2">
                    {item.display_name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Current Location Card */}
        <div
          onClick={handleGetCurrentLocation}
          className="p-4 border border-gray-200 hover:border-red-600 transition-colors cursor-pointer group flex items-start gap-3 bg-white"
        >
          <div className="text-gray-700 group-hover:text-red-600 transition-colors mt-0.5">
            {geoLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-red-600" />
            ) : (
              <Crosshair className="w-5 h-5" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 group-hover:text-red-600 transition-colors">
              Get current location
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Using GPS</p>
          </div>
        </div>

        {/* Geo Error Message */}
        {geoError && (
          <p className="text-xs text-red-600 font-medium">{geoError}</p>
        )}

        {/* Saved Addresses Section */}
        <div className="space-y-3 pt-2">
          <p className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">
            SAVED ADDRESSES
          </p>

          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 text-center space-y-1">
            <Home className="w-5 h-5 text-gray-400 mx-auto" />
            <p className="text-xs font-semibold text-gray-700">No saved addresses</p>
            <p className="text-[11px] text-gray-500">
              Use GPS or search above to find home cooks in your area.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default LocationDrawer;
