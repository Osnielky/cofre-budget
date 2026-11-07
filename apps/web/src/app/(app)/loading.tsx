/* Shown inside the shell while a page's code is on its way (first visit to a
   route). Three glass blocks where the content will land, pulsing, so the
   sidebar and the page frame are already in place. */
export default function AppLoading() {
  const block = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };
  return (
    <main className="flex-1 overflow-y-auto pt-14 md:pt-0" aria-busy="true" aria-label="Loading">
      <div className="px-4 sm:px-6 md:px-8 py-5 sm:py-6 flex flex-col gap-4">
        <div className="h-9 w-56 rounded-xl animate-pulse" style={block} />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl animate-pulse" style={block} />)}
        </div>
        <div className="h-72 rounded-2xl animate-pulse" style={block} />
      </div>
    </main>
  );
}
