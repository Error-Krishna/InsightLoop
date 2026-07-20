import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

// Route-level code splitting: each page is only fetched when its route is
// actually visited, instead of every page (charts, PDF/WhatsApp flows,
// etc.) being bundled into one large initial JS file. recharts in
// particular (used only by the Dashboard) is one of the heaviest
// dependencies here, so keeping it out of the main bundle meaningfully
// helps first-load time for everyone landing on, say, a bill page first.
const LoginPage = lazy(() => import("./features/auth/LoginPage"));
const SignupPage = lazy(() => import("./features/auth/SignupPage"));
const KachaBillPage = lazy(() => import("./features/bills/KachaBillPage"));
const PakkaBillPage = lazy(() => import("./features/bills/PakkaBillPage"));
const OrderDetailPage = lazy(() => import("./features/bills/OrderDetailPage"));
const DashboardLayout = lazy(() => import("./features/dashboard/DashboardLayout"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const FinishedInventoryPage = lazy(() => import("./features/inventory/FinishedInventoryPage"));
const SemiFinishedInventoryPage = lazy(() => import("./features/inventory/SemiFinishedInventoryPage"));
const RawInventoryPage = lazy(() => import("./features/inventory/RawInventoryPage"));
const WarehousesPage = lazy(() => import("./features/inventory/WarehousesPage"));
const InsightsPage = lazy(() => import("./features/insights/InsightsPage"));
const LandingPage = lazy(() => import("./features/landing/LandingPage"));
const ChatPage = lazy(() => import("./features/ai/ChatPage"));
const ProfilePage = lazy(() => import("./features/profile/ProfilePage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));
const UploadPage = lazy(() => import("./features/upload/UploadPage"));
const WorkersPage = lazy(() => import("./features/workers/WorkersPage"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/bills/kacha" element={<KachaBillPage />} />
            <Route path="/bills/pakka" element={<PakkaBillPage />} />
            <Route path="/bills/order/:id" element={<OrderDetailPage />} />
            <Route path="/inventory/finished" element={<FinishedInventoryPage />} />
            <Route path="/inventory/semi-finished" element={<SemiFinishedInventoryPage />} />
            <Route path="/inventory/raw" element={<RawInventoryPage />} />
            <Route path="/inventory/warehouses" element={<WarehousesPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/workers" element={<WorkersPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/ai-assistant" element={<ChatPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
