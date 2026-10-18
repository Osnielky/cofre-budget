/** Search across budget categories and project categories for the
    transaction category chooser. Pure, so the picker UI stays thin. */

export interface ChooserCategory { id: string; name: string; icon: string; color: string }
export interface ChooserProject { id: string; name: string; icon: string; color?: string | null; categories?: ChooserCategory[] }

export interface ProjectHit<P extends ChooserProject> { project: P; categories: ChooserCategory[] }

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function matchCategories<C extends ChooserCategory>(cats: C[], q: string): C[] {
  const n = normalizeQuery(q);
  return n ? cats.filter((c) => c.name.toLowerCase().includes(n)) : cats;
}

/** A project matching by name contributes all its categories; otherwise only
    the categories whose names match. Projects with nothing to offer drop out. */
export function matchProjects<P extends ChooserProject>(projects: P[], q: string): ProjectHit<P>[] {
  const n = normalizeQuery(q);
  return projects
    .map((project) => {
      const cats = project.categories ?? [];
      const categories = !n || project.name.toLowerCase().includes(n)
        ? cats
        : cats.filter((c) => c.name.toLowerCase().includes(n));
      return { project, categories };
    })
    .filter((h) => h.categories.length > 0);
}
