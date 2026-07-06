import dynamic from "next/dynamic";
import { JsonLd } from "@/components/seo/JsonLd";
import { LandingHero } from "@/components/landing/LandingHero";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildSoftwareApplicationSchema } from "@/lib/seo/structured-data";

const LandingAudience = dynamic(() =>
  import("@/components/landing/LandingAudience").then((module) => ({
    default: module.LandingAudience,
  })),
);

const LandingFeatures = dynamic(() =>
  import("@/components/landing/LandingFeatures").then((module) => ({
    default: module.LandingFeatures,
  })),
);

const LandingValueStrip = dynamic(() =>
  import("@/components/landing/LandingValueStrip").then((module) => ({
    default: module.LandingValueStrip,
  })),
);

const LandingHowItWorks = dynamic(() =>
  import("@/components/landing/LandingHowItWorks").then((module) => ({
    default: module.LandingHowItWorks,
  })),
);

const LandingPricingTeaser = dynamic(() =>
  import("@/components/landing/LandingPricingTeaser").then((module) => ({
    default: module.LandingPricingTeaser,
  })),
);

const LandingPaysForItself = dynamic(() =>
  import("@/components/landing/LandingPaysForItself").then((module) => ({
    default: module.LandingPaysForItself,
  })),
);

const LandingFAQ = dynamic(() =>
  import("@/components/landing/LandingFAQ").then((module) => ({
    default: module.LandingFAQ,
  })),
);

const LandingFinalCTA = dynamic(() =>
  import("@/components/landing/LandingFinalCTA").then((module) => ({
    default: module.LandingFinalCTA,
  })),
);

const LandingFooter = dynamic(() =>
  import("@/components/landing/LandingFooter").then((module) => ({
    default: module.LandingFooter,
  })),
);

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
