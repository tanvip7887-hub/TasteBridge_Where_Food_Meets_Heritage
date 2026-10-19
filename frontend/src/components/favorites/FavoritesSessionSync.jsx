import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearFavorites, fetchFavorites } from "../../store/slices/favoritesSlice.js";

export const FavoritesSessionSync = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  useEffect(() => {
    if (!isAuthenticated || user?.activePortal !== "CUSTOMER") {
      dispatch(clearFavorites());
      return;
    }
    dispatch(clearFavorites());
    dispatch(fetchFavorites(user.id));
  }, [dispatch, isAuthenticated, user?.id, user?.activePortal]);

  return null;
};

export default FavoritesSessionSync;
