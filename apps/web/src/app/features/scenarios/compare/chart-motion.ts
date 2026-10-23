/** Entry animation of the balance chart: 600 ms, or none under reduced motion (the CSS kill switch does not reach a canvas). */
export type ChartAnimation = false | { readonly duration: number };

interface MediaWindow {
  readonly matchMedia?: ((query: string) => { readonly matches: boolean }) | undefined;
}

export function chartAnimation(view: MediaWindow | null | undefined): ChartAnimation {
  const match = view?.matchMedia;
  // Without a way to ask, stay still: motion is only for users we know allow it.
  if (match === undefined) return false;
  return match.call(view, '(prefers-reduced-motion: reduce)').matches ? false : { duration: 600 };
}
