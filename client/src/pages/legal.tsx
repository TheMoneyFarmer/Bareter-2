import { useRoute } from "wouter";
import { LegalDocPage } from "@/components/legal-doc-page";

export function LegalPage() {
  const [, params] = useRoute("/legal/:slug");
  const slug = params?.slug ?? "";
  return <LegalDocPage slug={slug} />;
}

export default LegalPage;
