/**
 * subscriptions-store.ts — the database side of _shared/stripe.js's deps,
 * shared by the stripe-webhook and billing functions. Service role only.
 */
// deno-lint-ignore no-explicit-any
type Client = any

export function subscriptionStore(admin: Client) {
  return {
    async claimEvent(id: string, type: string) {
      const { error } = await admin.from('stripe_events').insert({ id, type })
      if (!error) return true
      if (error.code === '23505') return false // seen before: a redelivery
      throw new Error(`stripe_events: ${error.message}`)
    },
    async releaseEvent(id: string) {
      await admin.from('stripe_events').delete().eq('id', id)
    },
    async findUserByCustomer(customerId: string | null) {
      if (!customerId) return null
      const { data, error } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      if (error) throw new Error(`subscriptions: ${error.message}`)
      return data?.user_id ?? null
    },
    async getRow(userId: string) {
      const { data, error } = await admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw new Error(`subscriptions: ${error.message}`)
      return data ?? null
    },
    async saveRow(userId: string, patch: Record<string, unknown>) {
      const { error } = await admin
        .from('subscriptions')
        .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw new Error(`subscriptions: ${error.message}`)
    },
  }
}
