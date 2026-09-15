import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ImportsPage } from "./pages/ImportsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProductsPage } from "./pages/ProductsPage";
import { BrandReviewsPage } from "./pages/BrandReviewsPage";
import { IdentifierReviewsPage } from "./pages/IdentifierReviewsPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/brand-reviews" element={<BrandReviewsPage />} />
        <Route path="/identifier-reviews" element={<IdentifierReviewsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
