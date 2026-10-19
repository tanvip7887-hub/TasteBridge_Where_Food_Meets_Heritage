import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { initializeAuth } from "../store/slices/authSlice.js";
import { TOKEN_KEY } from "../utils/tokenStorage.js";
import MainLayout from "../layouts/MainLayout.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import LandingPage from "../pages/LandingPage.jsx";
import HomePage from "../pages/HomePage.jsx";
import ExplorePage from "../pages/ExplorePage.jsx";
import DishDetailPage from "../pages/DishDetailPage.jsx";
import PublicCookProfilePage from "../pages/PublicCookProfilePage.jsx";
import CartPage from "../pages/CartPage.jsx";
import CheckoutPage from "../pages/CheckoutPage.jsx";
import CustomerOrdersPage from "../pages/CustomerOrdersPage.jsx";
import CustomerOrderDetailPage from "../pages/CustomerOrderDetailPage.jsx";
import FavoritesPage from "../pages/FavoritesPage.jsx";
import MyEventsPage from "../pages/MyEventsPage.jsx";
import MyEventsLandingPage from "../pages/MyEventsLandingPage.jsx";
import WorkshopDetailPage from "../pages/WorkshopDetailPage.jsx";
import CustomerReviewsPage from "../pages/CustomerReviewsPage.jsx";
import AddressesPage from "../pages/AddressesPage.jsx";
import OnboardingPage from "../pages/OnboardingPage.jsx";
import Profile from "../pages/Profile.jsx";
import ForgotPasswordPage from "../pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "../pages/ResetPasswordPage.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import RoleRoute from "./RoleRoute.jsx";
import ActivePortalRoute from "./ActivePortalRoute.jsx";
import BecomeCookPage from "../pages/cook/BecomeCookPage.jsx";
import BecomeDeliveryAgentPage from "../pages/delivery/BecomeDeliveryAgentPage.jsx";
import CookWelcomePage from "../pages/cook/CookWelcomePage.jsx";
import ApprovedCookRoute from "./ApprovedCookRoute.jsx";
import CookLayout from "../layouts/CookLayout.jsx";
import DeliveryAgentLayout from "../layouts/DeliveryAgentLayout.jsx";
import ApprovedDeliveryAgentRoute from "./ApprovedDeliveryAgentRoute.jsx";
import DeliveryAgentHomePage from "../pages/delivery/DeliveryAgentHomePage.jsx";
import DeliveryAgentSectionPage from "../pages/delivery/DeliveryAgentSectionPage.jsx";
import DeliveryAgentProfilePage from "../pages/delivery/DeliveryAgentProfilePage.jsx";
import CookDashboardPage from "../pages/cook/panel/CookDashboardPage.jsx";
import CookKitchenPage from "../pages/cook/panel/CookKitchenPage.jsx";
import CookDishesPage from "../pages/cook/panel/CookDishesPage.jsx";
import CookOrdersPage from "../pages/cook/panel/CookOrdersPage.jsx";
import CookExperiencesPage from "../pages/cook/panel/CookExperiencesPage.jsx";
import CookBookingsPage from "../pages/cook/panel/CookBookingsPage.jsx";
import CookEarningsPage from "../pages/cook/panel/CookEarningsPage.jsx";
import CookReviewsPage from "../pages/cook/panel/CookReviewsPage.jsx";
import CookStoriesPage from "../pages/cook/panel/CookStoriesPage.jsx";
import StoriesPage from "../pages/StoriesPage.jsx";

// Admin Subpages
import AdminDashboard from "../pages/admin/AdminDashboard.jsx";
import AdminCooks from "../pages/admin/AdminCooks.jsx";
import AdminDeliveryAgents from "../pages/admin/AdminDeliveryAgents.jsx";
import AdminCustomers from "../pages/admin/AdminCustomers.jsx";
import AdminCategories from "../pages/admin/AdminCategories.jsx";
import AdminDishes from "../pages/admin/AdminDishes.jsx";
import AdminOrders from "../pages/admin/AdminOrders.jsx";
import AdminPayments from "../pages/admin/AdminPayments.jsx";
import AdminExperiences from "../pages/admin/AdminExperiences.jsx";
import AdminReviews from "../pages/admin/AdminReviews.jsx";
import AdminSocialReports from "../pages/admin/AdminSocialReports.jsx";
import AdminVerifications from "../pages/admin/AdminVerifications.jsx";
import AdminNotifications from "../pages/admin/AdminNotifications.jsx";
import AdminSettings from "../pages/admin/AdminSettings.jsx";
import AdminExperienceBookings from "../pages/admin/AdminExperienceBookings.jsx";

export const AppRoutes = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(initializeAuth());
    const syncSession = (event) => {
      if (event.key === TOKEN_KEY) dispatch(initializeAuth());
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [dispatch]);

  return (
    <Routes>
      {/* Admin Portal Routes (protected with ADMIN role) */}
      <Route
        path="/admin"
        element={
          <RoleRoute allowedRoles={["ADMIN"]}>
            <AdminLayout />
          </RoleRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="cooks" element={<AdminCooks />} />
        <Route path="delivery-agents" element={<AdminDeliveryAgents />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="dishes" element={<AdminDishes />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="dine" element={<AdminExperiences experienceType="HOME_DINING" />} />
        <Route path="workshops" element={<AdminExperiences experienceType="WORKSHOP" />} />
        <Route path="dine-bookings" element={<AdminExperienceBookings experienceType="HOME_DINING" />} />
        <Route path="workshop-bookings" element={<AdminExperienceBookings experienceType="WORKSHOP" />} />
        <Route path="experiences" element={<Navigate to="/admin/dine" replace />} />
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="social-reports" element={<AdminSocialReports />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Become a Cook & Cook Portal Routes */}
      <Route path="/become-a-cook" element={<BecomeCookPage />} />
      <Route path="/become-a-delivery-agent" element={<BecomeDeliveryAgentPage />} />
      <Route
        path="/delivery-agent"
        element={
          <ApprovedDeliveryAgentRoute>
            <DeliveryAgentLayout />
          </ApprovedDeliveryAgentRoute>
        }
      >
        <Route index element={<DeliveryAgentHomePage />} />
        <Route path="available" element={<DeliveryAgentSectionPage />} />
        <Route path="current" element={<DeliveryAgentSectionPage />} />
        <Route path="history" element={<DeliveryAgentSectionPage />} />
        <Route path="earnings" element={<DeliveryAgentSectionPage />} />
        <Route path="profile" element={<DeliveryAgentProfilePage />} />
        <Route path="help" element={<Navigate to="/delivery-agent" replace />} />
      </Route>
      {/* Cook Panel Protected Section under /cook/* */}
      <Route
        path="/cook"
        element={
          <ApprovedCookRoute>
            <CookLayout />
          </ApprovedCookRoute>
        }
      >
        <Route index element={<CookDashboardPage />} />
        <Route path="dashboard" element={<CookDashboardPage />} />
        <Route path="profile" element={<CookKitchenPage />} />
        <Route path="kitchen" element={<Navigate to="/cook/profile" replace />} />
        <Route path="dishes" element={<CookDishesPage />} />
        <Route path="stories" element={<CookStoriesPage />} />
        <Route path="orders" element={<CookOrdersPage />} />
        <Route path="events" element={<CookExperiencesPage />} />
        <Route path="experiences" element={<Navigate to="/cook/events" replace />} />
        <Route path="dine-bookings" element={<CookBookingsPage experienceType="HOME_DINING" />} />
        <Route path="workshop-bookings" element={<CookBookingsPage experienceType="WORKSHOP" />} />
        <Route path="bookings" element={<Navigate to="/cook/dine-bookings" replace />} />
        <Route path="earnings" element={<CookEarningsPage />} />
        <Route path="reviews" element={<CookReviewsPage />} />
        <Route path="help" element={<Navigate to="/cook" replace />} />
        <Route path="welcome" element={<CookWelcomePage />} />
      </Route>

      {/* Stories are public and must not switch a signed-in Cook to the Customer portal. */}
      <Route element={<MainLayout />}>
        <Route path="/stories" element={<StoriesPage />} />
      </Route>

      {/* Main Customer / Storefront Layout */}
      <Route path="/" element={<ActivePortalRoute portal="CUSTOMER" allowPublic><MainLayout /></ActivePortalRoute>}>
        {/* Dynamic Root Route: Shows Admin Dashboard if ADMIN, HomePage if other authenticated role, LandingPage if public */}
        <Route
          index
          element={
            isAuthenticated ? (
              user?.role === "ADMIN" ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <HomePage />
              )
            ) : (
              <LandingPage />
            )
          }
        />

        {/* Public Unauthenticated Password Reset Routes */}
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password/:token" element={<ResetPasswordPage />} />

        {/* User Onboarding Route */}
        <Route
          path="onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />

        {/* Protected Dashboard Route */}
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              {user?.role === "ADMIN" ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <HomePage />
              )}
            </ProtectedRoute>
          }
        />

        {/* Navigation & Stub Routes */}
        <Route path="explore" element={<ExplorePage />} />
        <Route path="workshops/:id" element={<WorkshopDetailPage />} />
        <Route path="dishes/:id" element={<DishDetailPage />} />
        <Route path="cooks/:id" element={<PublicCookProfilePage />} />
        <Route path="become-a-delivery-agent" element={<BecomeDeliveryAgentPage />} />
        <Route path="cart" element={<ProtectedRoute><CartPage /></ProtectedRoute>} />
        <Route path="checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
        <Route path="orders" element={<ProtectedRoute><CustomerOrdersPage /></ProtectedRoute>} />
        <Route path="my-events" element={<ProtectedRoute><RoleRoute allowedRoles={["CUSTOMER"]}><MyEventsLandingPage /></RoleRoute></ProtectedRoute>} />
        <Route path="my-events/dine" element={<ProtectedRoute><RoleRoute allowedRoles={["CUSTOMER"]}><MyEventsPage experienceType="HOME_DINING" /></RoleRoute></ProtectedRoute>} />
        <Route path="my-events/workshops" element={<ProtectedRoute><RoleRoute allowedRoles={["CUSTOMER"]}><MyEventsPage experienceType="WORKSHOP" /></RoleRoute></ProtectedRoute>} />
        <Route path="reviews" element={<ProtectedRoute><CustomerReviewsPage /></ProtectedRoute>} />
        <Route path="orders/confirmation/:id" element={<ProtectedRoute><CustomerOrderDetailPage confirmation /></ProtectedRoute>} />
        <Route path="orders/:id" element={<ProtectedRoute><CustomerOrderDetailPage /></ProtectedRoute>} />
        <Route path="addresses" element={<ProtectedRoute><AddressesPage /></ProtectedRoute>} />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="favourites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />

        {/* Fallback Route */}
        <Route
          path="*"
          element={isAuthenticated ? <HomePage /> : <LandingPage />}
        />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
