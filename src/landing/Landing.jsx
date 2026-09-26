import './landing.css'
import Nav from './sections/Nav'
import Hero from './sections/Hero'
import TrustStrip from './sections/TrustStrip'
import HowItWorks from './sections/HowItWorks'
import ChapterPlan from './sections/ChapterPlan'
import ChapterCoach from './sections/ChapterCoach'
import ChapterProgress from './sections/ChapterProgress'
import Audience from './sections/Audience'
import Safety from './sections/Safety'
import Comparison from './sections/Comparison'
import Pricing from './sections/Pricing'
import Faq from './sections/Faq'
import FinalCta from './sections/FinalCta'
import Footer from './sections/Footer'

/**
 * The public landing page at "/" for logged-out visitors. Loaded on its own
 * by landing/entry.jsx (see src/main.jsx); it imports nothing from the app.
 * All copy is in content.js.
 */
export default function Landing() {
  return (
    <div className="landing relative min-h-[100dvh] overflow-x-clip bg-canvas">
      <div className="l-grain" aria-hidden />
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <ChapterPlan />
        <ChapterCoach />
        <ChapterProgress />
        <Audience />
        <Safety />
        <Comparison />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
