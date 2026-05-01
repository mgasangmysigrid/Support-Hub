import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";

const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CreateTicket = lazy(() => import("@/pages/CreateTicket"));
const MyTickets = lazy(() => import("@/pages/MyTickets"));
const DepartmentQueue = lazy(() => import("@/pages/DepartmentQueue"));
const TicketDetail = lazy(() => import("@/pages/TicketDetail"));
const SurveyPage = lazy(() => import("@/pages/SurveyPage"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"));
const MyLeave = lazy(() => import("@/pages/MyLeave"));
const LeaveCalendar = lazy(() => import("@/pages/LeaveCalendar"));
const LeaveApprovals = lazy(() => import("@/pages/LeaveApprovals"));
const MyProfile = lazy(() => import("@/pages/MyProfile"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const MyDocuments = lazy(() => import("@/pages/MyDocuments"));
const EmployeeDirectory = lazy(() => import("@/pages/EmployeeDirectory"));
const TicketAnalytics = lazy(() => import("@/pages/TicketAnalytics"));
const LeaveOverview = lazy(() => import("@/pages/LeaveOverview"));
const EndorsementEntry = lazy(() => import("@/pages/EndorsementEntry"));
const EndorsementDetailPage = lazy(() => import("@/pages/EndorsementDetailPage"));
const CreateEndorsementPage = lazy(() => import("@/pages/CreateEndorsementPage"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const HelpCenter = lazy(() => import("@/pages/HelpCenter"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex h-full min-h-[200px] items-center justify-center text-muted-foreground">Loading...</div>
);

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route element={<AuthRoute />}>
                <Route path="/login" element={<Login />} />
              </Route>
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/tickets/create" element={<CreateTicket />} />
                  <Route path="/tickets" element={<MyTickets />} />
                  <Route path="/tickets/:id" element={<TicketDetail />} />
                  <Route path="/tickets/:id/survey" element={<SurveyPage />} />
                  <Route path="/department" element={<DepartmentQueue />} />
                  <Route path="/leave/calendar" element={<LeaveCalendar />} />
                  <Route path="/leave/my-leave" element={<MyLeave />} />
                  <Route path="/leave/approvals" element={<LeaveApprovals />} />
                  <Route path="/leave/overview" element={<LeaveOverview />} />
                  <Route path="/leave/endorsements" element={<EndorsementEntry />} />
                  <Route path="/leave/endorsements/new" element={<CreateEndorsementPage />} />
                  <Route path="/leave/endorsements/:id" element={<EndorsementDetailPage />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/profile" element={<MyProfile />} />
                  <Route path="/profile/:userId" element={<UserProfile />} />
                  <Route path="/directory" element={<EmployeeDirectory />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/documents" element={<MyDocuments />} />
                  <Route path="/knowledge-base" element={<KnowledgeBase />} />
                  <Route path="/tickets/analytics" element={<TicketAnalytics />} />
                  <Route path="/help-center" element={<HelpCenter />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

