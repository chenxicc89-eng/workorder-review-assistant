import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { ReviewPage } from "@/pages/ReviewPage";
import { CasesPage } from "@/pages/CasesPage";
import { StandardsPage } from "@/pages/StandardsPage";
import { LearningPage } from "@/pages/LearningPage";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<ReviewPage />} />
            <Route path="/cases" element={<CasesPage />} />
            <Route path="/standards" element={<StandardsPage />} />
            <Route path="/learning" element={<LearningPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  );
}
