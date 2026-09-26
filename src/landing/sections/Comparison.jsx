import { Check, X } from '@phosphor-icons/react'
import { comparison } from '../content'
import Reveal from '../ui/Reveal'

function Value({ value, note, strong }) {
  let main
  if (value === true) {
    main = (
      <span className={`inline-flex items-center gap-1.5 font-medium ${strong ? 'text-primary-light' : 'text-zinc-200'}`}>
        <Check size={16} weight="bold" />
        {comparison.yes}
      </span>
    )
  } else if (value === false) {
    main = (
      <span className="inline-flex items-center gap-1.5 text-zinc-500">
        <X size={16} />
        {comparison.no}
      </span>
    )
  } else {
    main = <span className={`font-mono font-medium ${strong ? 'text-zinc-50' : 'text-zinc-300'}`}>{value}</span>
  }
  return (
    <div>
      {main}
      {note && <div className="mt-1 text-xs text-zinc-500">{note}</div>}
    </div>
  )
}

/**
 * md+: a real table with Runko's column lit. Below md a 4-column table would
 * need horizontal scrolling, so each row becomes its own block.
 */
export default function Comparison() {
  const [runko, ...others] = comparison.columns
  return (
    <section className="l-section">
      <Reveal className="max-w-3xl">
        <h2 className="l-h2">{comparison.title}</h2>
        <p className="l-lead">{comparison.intro}</p>
      </Reveal>

      <Reveal className="mt-14 hidden md:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <caption className="sr-only">{comparison.title}</caption>
          <thead>
            <tr>
              <td className="w-[28%]" />
              <th scope="col" className="rounded-t-[1.5rem] bg-primary-faint px-6 pb-4 pt-6 text-lg font-semibold text-zinc-50">
                {runko}
              </th>
              {others.map((c) => (
                <th key={c} scope="col" className="px-6 pb-4 pt-6 text-lg font-semibold text-zinc-400">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row, r) => {
              const last = r === comparison.rows.length - 1
              return (
                <tr key={row.label}>
                  <th scope="row" className="border-t border-white/[0.06] py-5 pr-6 font-medium text-zinc-300">
                    {row.label}
                  </th>
                  {row.values.map((v, c) => (
                    <td
                      key={c}
                      className={`border-t border-white/[0.06] px-6 py-5 align-top ${
                        c === 0 ? `bg-primary-faint ${last ? 'rounded-b-[1.5rem]' : ''}` : ''
                      }`}
                    >
                      <Value value={v} note={row.notes[c]} strong={c === 0} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Reveal>

      <div className="mt-12 space-y-4 md:hidden">
        {comparison.rows.map((row) => (
          <Reveal key={row.label} className="l-shell">
            <div className="l-core p-5">
              <h3 className="font-semibold text-zinc-100">{row.label}</h3>
              <dl className="mt-4 space-y-3">
                {comparison.columns.map((col, c) => (
                  <div
                    key={col}
                    className={`flex items-start justify-between gap-4 ${c === 0 ? '-mx-2 rounded-2xl bg-primary-faint px-2 py-2' : ''}`}
                  >
                    <dt className={`text-sm ${c === 0 ? 'font-semibold text-zinc-50' : 'text-zinc-400'}`}>{col}</dt>
                    <dd className="text-right text-sm">
                      <Value value={row.values[c]} note={row.notes[c]} strong={c === 0} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
