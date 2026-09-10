import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import CasaDashboard from "./pages/CasaDashboard";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Library from "./pages/Library";
import Costs from "./pages/Costs";
import Agent from "./pages/Agent";
import ResetPassword from "./pages/ResetPassword";
import Gerar from "./pages/Gerar";
import Aprovados from "./pages/Aprovados";
import AdminCasas from "./pages/admin/Casas";
import AdminCampanhas from "./pages/admin/Campanhas";
import AdminPresets from "./pages/admin/Presets";
import AdminUsuarios from "./pages/admin/Usuarios";
import AdminPublicacao from "./pages/admin/Publicacao";
import AdminBiblioteca from "./pages/admin/Biblioteca";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/biblioteca" element={<Library />} />
          <Route path="/custos" element={<Costs />} />
          <Route path="/agente" element={<Agent />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/gerar" element={<Gerar />} />
          <Route path="/casa/:slug" element={<CasaDashboard />} />
          <Route path="/casa/:slug/aprovados" element={<Aprovados />} />
          <Route path="/admin/casas" element={<AdminCasas />} />
          <Route path="/admin/:slug/campanhas" element={<AdminCampanhas />} />
          <Route path="/admin/:slug/presets" element={<AdminPresets />} />
          <Route path="/admin/:slug/usuarios" element={<AdminUsuarios />} />
          <Route path="/admin/:slug/publicacao" element={<AdminPublicacao />} />
          <Route path="/admin/:slug/biblioteca" element={<AdminBiblioteca />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
