import type { Metadata } from "next";

import Lab2ComparisonPage from "@/components/lab2/Lab2ComparisonPage";
import "../lab2.css";

export const metadata: Metadata = {
  title: "Lab 2 Solver Comparison",
  description: "Same-scenario visual comparison of three constraint-satisfaction solvers",
};

export default function ComparisonPage() {
  return <Lab2ComparisonPage />;
}
