import * as React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { ReviewPage, EMPTY_REVIEW_DRAFT, type ReviewDraft } from "@/pages/ReviewPage";
import { CasesPage } from "@/pages/CasesPage";
import { StandardsPage } from "@/pages/StandardsPage";
import { LearningPage } from "@/pages/LearningPage";

export default function App() {
  // 工单审核的"正在进行"内容提升到此处持有:App 不随导航标签切换卸载,
  // 故切走再切回工单审核页时表单/结果仍在;整页刷新则 App 重挂载、内存清空(刷新不保留)。
  const [reviewDraft, setReviewDraft] = React.useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route
              path="/"
              element={<ReviewPage draft={reviewDraft} onDraftChange={setReviewDraft} />}
            />
            <Route path="/cases" element={<CasesPage />} />
            <Route path="/standards" element={<StandardsPage />} />
            <Route path="/learning" element={<LearningPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  );
}
