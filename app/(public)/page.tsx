import { JsonLd } from "@/components/seo/JsonLd";
import { LandingAudience } from "@/components/landing/LandingAudience";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingFinalCTA } from "@/components/landing/LandingFinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingPaysForItself } from "@/components/landing/LandingPaysForItself";
import { LandingPricingTeaser } from "@/components/landing/LandingPricingTeaser";
import { LandingValueStrip } from "@/components/landing/LandingValueStrip";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildSoftwareApplicationSchema } from "@/lib/seo/structured-data";

export const metadata = buildPageMetadata("home");

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <JsonLd data={buildSoftwareApplicationSchema()} />
      <PublicNavbar />
      <main>
        <LandingHero />
        <LandingAudience />
        <LandingFeatures />
        <LandingValueStrip />
        <LandingHowItWorks />
        <LandingPricingTeaser />
        <LandingPaysForItself />
        <LandingFAQ />
        <LandingFinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
