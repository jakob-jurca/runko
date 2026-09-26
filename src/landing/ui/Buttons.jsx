import { ArrowUpRight } from '@phosphor-icons/react'
import { cta } from '../content'

/**
 * The signup CTA. Plain <a>, not a router link: the landing page has no
 * router, and /auth belongs to the app bundle, which loads on navigation.
 */
export function SignupButton({ className = '' }) {
  return (
    <a href={cta.signupHref} className={`l-btn-primary group ${className}`}>
      {cta.signup}
      <span className="l-btn-primary-icon" aria-hidden>
        <ArrowUpRight size={18} weight="bold" />
      </span>
    </a>
  )
}

export function LoginButton({ className = '' }) {
  return (
    <a href={cta.loginHref} className={`l-btn-ghost ${className}`}>
      {cta.login}
    </a>
  )
}
