import Sidebar from '@/components/Sidebar';
import PhoneTopBar from '@/components/PhoneTopBar';
import PhoneTabBar from '@/components/PhoneTabBar';
import PrefetchAppData from '@/components/PrefetchAppData';
import { PrimaryActionProvider } from '@/components/shell/PrimaryAction';

/* The signed-in shell. Every app page used to render its own
   <div class="flex h-dvh"><Sidebar/> … </div>, so the sidebar unmounted and
   remounted on every navigation; here it is rendered once and persists while
   the page below it changes. Pages keep their own <main> (they differ in
   scroll and padding) inside a `contents` wrapper, so <main> is this div's
   flex child. URLs are unchanged: (app) is a route group.

   Below md the shell is a column: the fixed top bar (page name + the page's
   primary action, which <main> pads for with pt-14), <main>, then the tab bar
   as a flex sibling so no page pads for it. From md it is a row with the
   sidebar. PrefetchAppData starts the dashboard's requests as soon as the
   shell mounts, ahead of the page's own code. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrimaryActionProvider>
      <div className="flex flex-col md:flex-row h-dvh overflow-hidden">
        <PhoneTopBar />
        <Sidebar />
        <PrefetchAppData />
        {children}
        <PhoneTabBar />
      </div>
    </PrimaryActionProvider>
  );
}
