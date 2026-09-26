import { finalCta } from '../content'
import { SignupButton } from '../ui/Buttons'
import Reveal from '../ui/Reveal'

/** One run of the band: the phrases with the brand mark between them. */
function Run() {
  return (
    <div className="flex shrink-0 items-center">
      {finalCta.marquee.map((phrase) => (
        <span key={phrase} className="flex items-center">
          <span className="whitespace-nowrap px-6 text-6xl font-semibold tracking-tight text-zinc-50 md:px-10 md:text-8xl lg:text-9xl">
            {phrase}
          </span>
          <img src="/runko.svg" alt="" className="h-10 w-10 md:h-16 md:w-16" />
        </span>
      ))}
    </div>
  )
}

/**
 * The page's only marquee. The track holds the run twice and slides by half
 * its width, so the loop is seamless. It pauses under the pointer. With reduced
 * motion it stands still.
 */
export default function FinalCta() {
  return (
    <section className="overflow-hidden py-24 md:py-32" aria-labelledby="l-final-title">
      <div className="l-marquee border-y border-white/[0.07] py-8 md:py-10" aria-hidden>
        <div className="l-marquee-track flex w-max">
          <Run />
          <Run />
        </div>
      </div>

      <Reveal className="mx-auto mt-20 flex max-w-3xl flex-col items-center px-4 text-center sm:px-6">
        <h2 id="l-final-title" className="text-3xl font-semibold leading-tight tracking-tight text-zinc-50 md:text-5xl">
          {finalCta.title}
        </h2>
        <p className="mt-5 text-lg text-zinc-400">{finalCta.text}</p>
        <SignupButton className="mt-10" />
      </Reveal>
    </section>
  )
}
