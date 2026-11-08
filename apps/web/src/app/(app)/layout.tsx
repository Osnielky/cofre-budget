import Sidebar from '@/components/Sidebar';
import PrefetchAppData from '@/components/PrefetchAppData';

/* The signed-in shell. Every app page used to render its own
   <div class="flex h-dvh"><Sidebar/> … </div>, so the sidebar unmounted and
   remounted on every navigation; here it is rendered once and persists while
   the page below it changes. Pages keep their own <main> (they differ in
   scroll and padding) inside a `contents` wrapper, so <main> is this div's
   flex child. URLs are unchanged: (app) is a route group.

   PrefetchAppData starts the dashboard's requests as soon as the shell mounts,
   ahead of the page's own code. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <PrefetchAppData />
      {children}
    </div>
  );
}
