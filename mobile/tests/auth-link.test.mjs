import { check, summary } from '../../tests/harness.mjs'
import { parseAuthLink } from '../lib/auth-link.js'

const ok = parseAuthLink('runko://reset-password#access_token=AAA.bbb&refresh_token=rrr&expires_in=3600&type=recovery')
check('recovery link in the fragment is recognised', ok.kind === 'recovery')
check('access token is read', ok.accessToken === 'AAA.bbb')
check('refresh token is read', ok.refreshToken === 'rrr')

const expo = parseAuthLink('exp://192.168.1.5:8081/--/reset-password#access_token=a&refresh_token=b&type=recovery')
check('Expo Go link works too', expo.kind === 'recovery')

const query = parseAuthLink('runko://reset-password?access_token=a&refresh_token=b&type=recovery')
check('tokens in the query string work', query.kind === 'recovery')

const expired = parseAuthLink('runko://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
check('expired link is an error', expired.kind === 'error' && expired.errorCode === 'otp_expired')

check('error wins over tokens', parseAuthLink('runko://x#error_code=otp_expired&access_token=a&refresh_token=b&type=recovery').kind === 'error')
check('missing refresh token is not recovery', parseAuthLink('runko://x#access_token=a&type=recovery').kind === null)
check('signup type is not recovery', parseAuthLink('runko://x#access_token=a&refresh_token=b&type=signup').kind === null)
check('plain deep link is nothing', parseAuthLink('runko://reset-password').kind === null)
check('null and garbage are nothing', parseAuthLink(null).kind === null && parseAuthLink(42).kind === null)

export const result = summary('auth-link')
