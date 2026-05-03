import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./features/auth/LoginPage";
import SignupPage from "./features/auth/SignupPage";
import KachaBillPage from "./features/bills/KachaBillPage";
import PakkaBillPage from "./features/bills/PakkaBillPage";
import DashboardLayout from "./features/dashboard/DashboardLayout";
import DashboardPage from "./features/dashboard/DashboardPage";
import FinishedInventoryPage from "./features/inventory/FinishedInventoryPage";
import RawInventoryPage from "./features/inventory/RawInventoryPage";
import WarehousesPage from "./features/inventory/WarehousesPage";
import InsightsPage from "./features/insights/InsightsPage";
import LandingPage from "./features/landing/LandingPage";
import ChatPage from "./features/ai/ChatPage";
import ProfilePage from "./features/profile/ProfilePage";
import SettingsPage from "./features/settings/SettingsPage";
import UploadPage from "./features/upload/UploadPage";
import WorkersPage from "./features/workers/WorkersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/bills/kacha" element={<KachaBillPage />} />
          <Route path="/bills/pakka" element={<PakkaBillPage />} />
          <Route path="/inventory/finished" element={<FinishedInventoryPage />} />
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
  );
}
