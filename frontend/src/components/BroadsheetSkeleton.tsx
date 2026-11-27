import React from 'react';

export const BroadsheetSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลดฉบับข่าวล่าสุด"
      className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-pulse"
    >
      {/* Left Primary Column (~75%): Lead Briefing + 2-Column Category Cards */}
      <div className="lg:col-span-8 xl:col-span-9 space-y-10">
        {/* Lead Briefing Skeleton */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-rule-strong">
            <div className="h-3.5 w-48 rounded bg-subtle" />
            <div className="h-3.5 w-32 rounded bg-subtle" />
          </div>

          <div className="rounded-lg bg-surface border border-rule border-t-2 border-t-editorial/40 p-6 sm:p-7">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-24 rounded bg-subtle" />
                  <div className="h-3 w-16 rounded bg-subtle" />
                </div>
                <div className="space-y-2.5">
                  <div className="h-6 w-full rounded bg-subtle" />
                  <div className="h-6 w-4/5 rounded bg-subtle" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-subtle/80" />
                  <div className="h-4 w-11/12 rounded bg-subtle/80" />
                  <div className="h-4 w-2/3 rounded bg-subtle/80" />
                </div>
                <div className="flex gap-6 py-3 border-y border-rule/80">
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-16 rounded bg-subtle" />
                    <div className="h-3.5 w-24 rounded bg-subtle" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-16 rounded bg-subtle" />
                    <div className="h-3.5 w-20 rounded bg-subtle" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-36 rounded bg-subtle" />
                  <div className="h-3.5 w-24 rounded bg-subtle" />
                </div>
              </div>
              <div className="md:col-span-5">
                <div className="aspect-[16/9] w-full rounded-md bg-subtle" />
              </div>
            </div>
          </div>
        </section>

        {/* Category Section Skeleton */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-rule-strong">
            <div className="h-5 w-44 rounded bg-subtle" />
            <div className="h-3.5 w-20 rounded bg-subtle" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="rounded-lg bg-surface border border-rule p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3 w-28 rounded bg-subtle" />
                  <div className="h-3.5 w-8 rounded bg-subtle" />
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-full rounded bg-subtle" />
                  <div className="h-5 w-3/4 rounded bg-subtle" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-full rounded bg-subtle/80" />
                  <div className="h-3.5 w-5/6 rounded bg-subtle/80" />
                </div>
                <div className="pt-3 border-t border-rule/80 flex items-center justify-between">
                  <div className="h-3 w-32 rounded bg-subtle" />
                  <div className="h-3 w-14 rounded bg-subtle" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Right Column (~25%): Rumor Radar Skeleton */}
      <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
        <div className="pb-2 border-b-2 border-dashed border-rumor-border/50 flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-subtle" />
          <div className="h-3 w-16 rounded bg-subtle" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-subtle/80" />
          <div className="h-3 w-4/5 rounded bg-subtle/80" />
        </div>
        {[0, 1].map((idx) => (
          <div
            key={idx}
            className="rounded-lg bg-rumor-surface/60 border border-dashed border-rumor-border/50 p-5 space-y-3"
          >
            <div className="h-3 w-24 rounded bg-subtle" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-subtle" />
              <div className="h-4 w-4/5 rounded bg-subtle" />
            </div>
            <div className="h-3 w-28 rounded bg-subtle" />
          </div>
        ))}
      </aside>
    </div>
  );
};
