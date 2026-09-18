/** Shared button looks: one accent (blue), everything else neutral. */
const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 ease-out select-none ' +
  'active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 ' +
  'disabled:pointer-events-none disabled:opacity-40';

export const button = {
  primary: `${base} bg-blue-400 text-blue-950 hover:bg-blue-300`,
  secondary: `${base} bg-slate-100 text-slate-900 hover:bg-white`,
  quiet: `${base} bg-white/8 text-slate-100 hover:bg-white/14`,
  danger: `${base} bg-rose-600 text-white hover:bg-rose-500`,
};

export const field =
  'w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-slate-50 outline-none transition ' +
  'placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/25';

export const label = 'mb-1.5 block text-sm font-medium text-slate-300';
